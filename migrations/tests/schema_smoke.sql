-- Run after V1 with psql -X -v ON_ERROR_STOP=1 -f this-file.sql.
-- All test data is rolled back, including on failure when psql exits.
BEGIN;
DO $$
DECLARE
  r uuid := gen_random_uuid();
  other_request uuid := gen_random_uuid();
  icbc uuid;
  health uuid;
  op uuid;
  batch uuid;
  test_owner text := 'test-' || gen_random_uuid()::text;
  unicode_name text := 'Sḵwx̱wú7mesh ʔə ᐊᓂᔑᓈᐯ';
  actual text;
BEGIN
  IF (SELECT count(*) FROM information_schema.triggers
    WHERE trigger_schema = 'address_change' AND trigger_name = 'z_set_updated_at') <> 8 THEN
    RAISE EXCEPTION 'Missing shared audit trigger';
  END IF;
  SELECT partner_id INTO STRICT icbc FROM address_change.partner_system WHERE partner_code = 'ICBC';
  SELECT partner_id INTO STRICT health FROM address_change.partner_system WHERE partner_code = 'HEALTH';
  INSERT INTO address_change.address_change_request
    (request_id, owner_sub, idempotency_key, raw_payload_encrypted, effective_date, created_by, updated_by)
    VALUES (r, test_owner, 'submission-1', decode('0102', 'hex'), current_date, 'test', 'test');
  INSERT INTO address_change.request_person(request_id, first_name, last_name, date_of_birth)
    VALUES (r, unicode_name, 'Test', date '1990-01-01');
  INSERT INTO address_change.submitted_address
    (request_id, old_address_line_one, old_city, old_province, old_postal_code, old_country,
     new_address_line_one, new_city, new_province, new_postal_code, new_country, is_billing_address_same)
    VALUES (r, unicode_name, 'Test', 'BC', 'V0A 0A0', 'CA', unicode_name, 'Test', 'BC', 'V0A 0A0', 'CA', true);
  INSERT INTO address_change.processing_operation(request_id, partner_id, delivery_mode)
    VALUES (r, icbc, 'FLAT_FILE') RETURNING operation_id INTO op;
  INSERT INTO address_change.processing_operation(request_id, partner_id, delivery_mode)
    VALUES (r, health, 'FLAT_FILE');
  SELECT first_name INTO actual FROM address_change.request_person WHERE request_id = r;
  IF convert_to(actual, 'UTF8') <> convert_to(unicode_name, 'UTF8') THEN
    RAISE EXCEPTION 'Unicode did not round-trip';
  END IF;
  BEGIN
    INSERT INTO address_change.address_change_request
      (request_id, owner_sub, idempotency_key, raw_payload_encrypted, effective_date, created_by, updated_by)
      VALUES (other_request, test_owner, 'submission-2', decode('01', 'hex'), current_date, 'test', 'test');
    RAISE EXCEPTION 'Allowed two active requests';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO address_change.processing_operation(request_id, partner_id, delivery_mode)
      VALUES (r, icbc, 'REALTIME');
    RAISE EXCEPTION 'Allowed duplicate partner across delivery modes';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  INSERT INTO address_change.flat_file_batch(partner_id, file_date)
    VALUES (health, current_date) RETURNING batch_id INTO batch;
  BEGIN
    UPDATE address_change.flat_file_batch SET status = 'STARTED' WHERE batch_id = batch;
    RAISE EXCEPTION 'Allowed an attempt-only status on a batch';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
  BEGIN
    UPDATE address_change.flat_file_batch SET status = 'NOT_A_STATUS' WHERE batch_id = batch;
    RAISE EXCEPTION 'Allowed an undefined batch status';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
  -- Vocabulary can evolve without altering the consuming table.
  INSERT INTO address_change.status_type(status_category, status_code, display_name)
    VALUES ('BATCH', 'SMOKE_TEST_ONLY', 'Test status');
  UPDATE address_change.flat_file_batch SET status = 'SMOKE_TEST_ONLY' WHERE batch_id = batch;
  BEGIN
    DELETE FROM address_change.status_type
      WHERE status_category = 'BATCH' AND status_code = 'SMOKE_TEST_ONLY';
    RAISE EXCEPTION 'Allowed deletion of a referenced status';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
  UPDATE address_change.flat_file_batch SET status = 'BUILDING' WHERE batch_id = batch;
  IF NOT EXISTS (SELECT 1 FROM address_change.flat_file_batch
    WHERE batch_id = batch AND updated_at > created_at) THEN
    RAISE EXCEPTION 'Shared updated_at trigger did not run';
  END IF;
  BEGIN
    UPDATE address_change.address_change_request SET status = 'COMPLETED' WHERE request_id = r;
    RAISE EXCEPTION USING ERRCODE = 'ZX001', MESSAGE = 'Allowed premature request completion';
  EXCEPTION WHEN raise_exception THEN NULL;
  END;
  BEGIN
    UPDATE address_change.processing_operation SET batch_id = batch WHERE operation_id = op;
    RAISE EXCEPTION 'Allowed cross-partner batch membership';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
  INSERT INTO address_change.processing_attempt(operation_id, attempt_number, request_payload_encrypted)
    VALUES (op, 1, decode('01', 'hex'));
  BEGIN
    INSERT INTO address_change.processing_attempt(operation_id, attempt_number, request_payload_encrypted)
      VALUES (op, 2, decode('01', 'hex'));
    RAISE EXCEPTION 'Allowed concurrent started attempts';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  UPDATE address_change.processing_attempt SET status = 'FAILED', completed_at = clock_timestamp()
    WHERE operation_id = op;
  INSERT INTO address_change.processing_attempt(operation_id, attempt_number, request_payload_encrypted)
    VALUES (op, 2, decode('02', 'hex'));
  UPDATE address_change.processing_attempt SET status = 'SUCCEEDED', completed_at = clock_timestamp()
    WHERE operation_id = op AND attempt_number = 2;
  UPDATE address_change.processing_operation SET status = 'FAILED' WHERE request_id = r;
  SELECT status INTO actual FROM address_change.address_change_request WHERE request_id = r;
  IF actual <> 'FAILED' THEN RAISE EXCEPTION 'Failed request status not stored'; END IF;
  BEGIN
    INSERT INTO address_change.address_change_request
      (owner_sub, idempotency_key, raw_payload_encrypted, effective_date, created_by, updated_by)
      VALUES (test_owner, 'blocked-retry', decode('01', 'hex'), current_date, 'test', 'test');
    RAISE EXCEPTION 'Failed request incorrectly released owner slot';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  UPDATE address_change.processing_operation SET status = 'SUCCEEDED' WHERE operation_id = op;
  SELECT status INTO actual FROM address_change.request_status WHERE request_id = r;
  IF actual <> 'PARTIALLY_COMPLETED' THEN RAISE EXCEPTION 'Incorrect partial status: %', actual; END IF;
  UPDATE address_change.processing_operation SET batch_id = batch
    WHERE request_id = r AND partner_id = health;
  UPDATE address_change.flat_file_batch SET status = 'SENT', record_count = 1
    WHERE batch_id = batch;
  SELECT status INTO actual FROM address_change.request_status WHERE request_id = r;
  IF actual <> 'COMPLETED' THEN RAISE EXCEPTION 'Incorrect completed status'; END IF;
  IF NOT EXISTS (SELECT 1 FROM address_change.address_change_request
    WHERE request_id = r AND status = 'COMPLETED')
    THEN RAISE EXCEPTION 'Completed request status not stored'; END IF;
  IF NOT EXISTS (SELECT 1 FROM address_change.processing_operation
    WHERE request_id = r AND partner_id = health AND status = 'SUCCEEDED')
    THEN RAISE EXCEPTION 'Successful transfer did not complete partner operation'; END IF;
  BEGIN
    UPDATE address_change.processing_operation SET status = 'PENDING' WHERE operation_id = op;
    RAISE EXCEPTION USING ERRCODE = 'ZX001', MESSAGE = 'Allowed reopening closed operation';
  EXCEPTION WHEN raise_exception THEN NULL;
  END;
  -- Demonstrate owner slot is released after completion; this new row is removed below.
  INSERT INTO address_change.address_change_request
    (request_id, owner_sub, idempotency_key, raw_payload_encrypted, effective_date, created_by, updated_by)
    VALUES (other_request, test_owner, 'submission-2', decode('01', 'hex'), current_date, 'test', 'test');
  DELETE FROM address_change.address_change_request WHERE request_id = other_request;
  RAISE NOTICE 'Core constraints and Unicode checks passed';
END $$;
SET CONSTRAINTS ALL IMMEDIATE;
ROLLBACK;
