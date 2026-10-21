-- Run after V1 with psql -X -v ON_ERROR_STOP=1 -f this-file.sql.
-- Structural schema checks only. Workflow/concurrency tests belong to the service.
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
  IF EXISTS (SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'address_change' AND NOT t.tgisinternal) THEN
    RAISE EXCEPTION 'Application triggers must not be installed';
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
     new_address_line_one, new_city, new_province, new_postal_code, new_country, is_mailing_address_same)
    VALUES (r, unicode_name, 'Test', 'BC', 'V0A 0A0', 'CA', unicode_name, 'Test', 'BC', 'V0A 0A0', 'CA', true);
  IF NOT EXISTS (SELECT 1 FROM address_change.submitted_address
    WHERE request_id = r AND is_mailing_address_same
      AND mailing_address_line_one IS NULL AND mailing_address_line_two IS NULL
      AND mailing_city IS NULL AND mailing_province IS NULL
      AND mailing_postal_code IS NULL AND mailing_country IS NULL) THEN
    RAISE EXCEPTION 'Shared residential/mailing choice did not round-trip';
  END IF;
  BEGIN
    UPDATE address_change.submitted_address SET is_mailing_address_same = NULL WHERE request_id = r;
    RAISE EXCEPTION 'Allowed a missing mailing-address choice';
  EXCEPTION WHEN not_null_violation THEN NULL;
  END;
  -- A distinct mailing address preserves Unicode and does not replace residential.
  UPDATE address_change.submitted_address
    SET is_mailing_address_same = false, mailing_address_line_one = 'PO Box 42',
        mailing_address_line_two = unicode_name, mailing_city = 'Coquitlam',
        mailing_province = 'BC', mailing_postal_code = 'V3C 2C4', mailing_country = 'CA',
        updated_at = clock_timestamp(), updated_by = 'test'
    WHERE request_id = r;
  IF NOT EXISTS (SELECT 1 FROM address_change.submitted_address
    WHERE request_id = r AND NOT is_mailing_address_same
      AND mailing_address_line_one = 'PO Box 42'
      AND convert_to(mailing_address_line_two, 'UTF8') = convert_to(unicode_name, 'UTF8')
      AND mailing_city = 'Coquitlam' AND mailing_province = 'BC'
      AND mailing_postal_code = 'V3C 2C4' AND mailing_country = 'CA'
      AND convert_to(new_address_line_one, 'UTF8') = convert_to(unicode_name, 'UTF8')) THEN
    RAISE EXCEPTION 'Separate mailing/residential addresses did not round-trip';
  END IF;
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
    UPDATE address_change.address_change_request SET status = 'NOT_A_STATUS' WHERE request_id = r;
    RAISE EXCEPTION 'Allowed an undefined request status';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
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
  BEGIN
    UPDATE address_change.processing_attempt SET status = 'SUCCEEDED'
      WHERE operation_id = op AND attempt_number = 1;
    RAISE EXCEPTION 'Allowed completed attempt without completed_at';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  UPDATE address_change.processing_attempt
    SET status = 'FAILED', completed_at = clock_timestamp(), updated_at = clock_timestamp(), updated_by = 'test'
    WHERE operation_id = op AND attempt_number = 1;
  BEGIN
    INSERT INTO address_change.processing_attempt
      (operation_id, attempt_number, status, completed_at, request_payload_encrypted)
      VALUES (op, 1, 'FAILED', clock_timestamp(), decode('01', 'hex'));
    RAISE EXCEPTION 'Allowed duplicate attempt number';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  INSERT INTO address_change.processing_attempt(operation_id, attempt_number, request_payload_encrypted)
    VALUES (op, 2, decode('02', 'hex'));
  UPDATE address_change.processing_attempt
    SET status = 'SUCCEEDED', completed_at = clock_timestamp(), updated_at = clock_timestamp(), updated_by = 'test'
    WHERE operation_id = op AND attempt_number = 2;

  -- Simulate explicit caller writes; no automatic request aggregation is installed.
  UPDATE address_change.processing_operation
    SET status = 'FAILED', updated_at = clock_timestamp(), updated_by = 'test'
    WHERE request_id = r;
  SELECT status INTO actual FROM address_change.address_change_request WHERE request_id = r;
  IF actual <> 'SUBMITTED' THEN RAISE EXCEPTION 'Unexpected automatic request-status update'; END IF;
  UPDATE address_change.address_change_request
    SET status = 'FAILED', updated_at = clock_timestamp(), updated_by = 'test'
    WHERE request_id = r;
  BEGIN
    INSERT INTO address_change.address_change_request
      (owner_sub, idempotency_key, raw_payload_encrypted, effective_date, created_by, updated_by)
      VALUES (test_owner, 'blocked-retry', decode('01', 'hex'), current_date, 'test', 'test');
    RAISE EXCEPTION 'Failed request incorrectly released owner slot';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  UPDATE address_change.processing_operation
    SET batch_id = batch, updated_at = clock_timestamp(), updated_by = 'test'
    WHERE request_id = r AND partner_id = health;
  UPDATE address_change.flat_file_batch
    SET status = 'SENT', record_count = 1, transferred_at = clock_timestamp(),
        updated_at = clock_timestamp(), updated_by = 'test'
    WHERE batch_id = batch;
  IF EXISTS (SELECT 1 FROM address_change.processing_operation
    WHERE request_id = r AND partner_id = health AND status <> 'FAILED') THEN
    RAISE EXCEPTION 'Unexpected automatic batch completion';
  END IF;
  UPDATE address_change.processing_operation
    SET status = 'SUCCEEDED', updated_at = clock_timestamp(), updated_by = 'test'
    WHERE request_id = r;
  UPDATE address_change.address_change_request
    SET status = 'COMPLETED', updated_at = clock_timestamp(), updated_by = 'test'
    WHERE request_id = r;
  SELECT status INTO actual FROM address_change.request_status WHERE request_id = r;
  IF actual <> 'COMPLETED' THEN RAISE EXCEPTION 'View did not expose stored request status'; END IF;
  IF NOT EXISTS (SELECT 1 FROM address_change.request_status
    WHERE request_id = r AND operation_count = 2 AND succeeded_count = 2) THEN
    RAISE EXCEPTION 'Incorrect operation counts';
  END IF;
  BEGIN
    INSERT INTO address_change.address_change_request
      (owner_sub, idempotency_key, raw_payload_encrypted, effective_date, created_by, updated_by)
      VALUES (test_owner, 'submission-1', decode('01', 'hex'), current_date, 'test', 'test');
    RAISE EXCEPTION 'Allowed duplicate idempotency key on completed request';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  INSERT INTO address_change.address_change_request
    (request_id, owner_sub, idempotency_key, raw_payload_encrypted, effective_date, created_by, updated_by)
    VALUES (other_request, test_owner, 'submission-2', decode('01', 'hex'), current_date, 'test', 'test');
  DELETE FROM address_change.address_change_request WHERE request_id = r;
  IF EXISTS (SELECT 1 FROM address_change.request_person WHERE request_id = r)
    OR EXISTS (SELECT 1 FROM address_change.submitted_address WHERE request_id = r)
    OR EXISTS (SELECT 1 FROM address_change.processing_operation WHERE request_id = r)
    OR EXISTS (SELECT 1 FROM address_change.processing_attempt WHERE operation_id = op) THEN
    RAISE EXCEPTION 'Request purge did not cascade';
  END IF;
  RAISE NOTICE 'Schema constraints, explicit updates and Unicode checks passed';
END $$;
ROLLBACK;
