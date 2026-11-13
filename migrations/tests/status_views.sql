-- Run after all versioned migrations with psql -X -v ON_ERROR_STOP=1.
-- Reporting fixtures and partner configuration changes are always rolled back.
BEGIN;
DO $$
DECLARE
  request uuid := gen_random_uuid();
  draft uuid := gen_random_uuid();
  icbc uuid;
  health uuid;
  batch uuid;
  flat_operation uuid;
  api_operation uuid;
  fixture record;
  report address_change.flat_file_status%ROWTYPE;
  content_start timestamptz := '2026-01-01 09:00:00+00';
  content_end timestamptz := '2026-01-02 18:00:00+00';
  generated timestamptz := '2026-01-03 01:00:00+00';
  delivered timestamptz := '2026-01-03 02:00:00+00';
  backed_up timestamptz := '2026-01-03 03:00:00+00';
BEGIN
  SELECT partner_id INTO STRICT icbc FROM address_change.partner_system WHERE partner_code = 'ICBC';
  SELECT partner_id INTO STRICT health FROM address_change.partner_system WHERE partner_code = 'HEALTH';

  INSERT INTO address_change.flat_file_batch
    (partner_id, file_date, file_name, first_request_received_at, last_request_received_at)
    VALUES (icbc, date '2026-01-03', 'report-test-' || gen_random_uuid()::text, content_start, content_end)
    RETURNING batch_id INTO batch;

  -- Generation, transport and archival are independent. Claims from retries
  -- supersede old errors; completed timestamps supersede both claims and errors.
  FOR fixture IN
    SELECT * FROM (VALUES
      ('BUILDING', false, false, false, false, false, false, false, 'IN_PROGRESS', 'NOT_READY', 'NOT_READY'),
      ('READY', false, false, false, false, false, false, false, 'IN_PROGRESS', 'NOT_READY', 'NOT_READY'),
      ('FAILED', false, false, false, false, false, false, false, 'FAILED', 'NOT_READY', 'NOT_READY'),
      ('UNKNOWN', false, false, false, false, false, false, false, 'UNKNOWN', 'NOT_READY', 'NOT_READY'),
      ('READY', true, false, false, false, false, false, false, 'GENERATED', 'PENDING', 'NOT_READY'),
      ('TRANSFERRING', true, false, false, true, false, false, false, 'GENERATED', 'IN_PROGRESS', 'NOT_READY'),
      ('FAILED', true, false, false, false, true, false, false, 'GENERATED', 'FAILED', 'NOT_READY'),
      ('TRANSFERRING', true, false, false, true, true, false, false, 'GENERATED', 'IN_PROGRESS', 'NOT_READY'),
      ('UNKNOWN', true, false, false, false, false, false, false, 'GENERATED', 'UNKNOWN', 'NOT_READY'),
      ('SENT', true, true, false, false, false, false, false, 'GENERATED', 'SENT', 'NOT_STARTED'),
      ('SENT', true, true, false, false, false, true, false, 'GENERATED', 'SENT', 'IN_PROGRESS'),
      ('SENT', true, true, false, false, false, false, true, 'GENERATED', 'SENT', 'FAILED'),
      ('SENT', true, true, false, false, false, true, true, 'GENERATED', 'SENT', 'IN_PROGRESS'),
      ('FAILED', true, true, true, true, true, true, true, 'GENERATED', 'SENT', 'BACKED_UP')
    ) AS cases(batch_status, has_generated, has_delivered, has_backup,
      delivery_claim, delivery_error, backup_claim, backup_error,
      expected_generation, expected_delivery, expected_backup)
  LOOP
    UPDATE address_change.flat_file_batch
      SET status = fixture.batch_status,
          generated_at = CASE WHEN fixture.has_generated THEN generated END,
          transferred_at = CASE WHEN fixture.has_delivered THEN delivered END,
          s3_backed_up_at = CASE WHEN fixture.has_backup THEN backed_up END,
          sftp_claimed_at = CASE WHEN fixture.delivery_claim THEN generated END,
          sftp_last_error = CASE WHEN fixture.delivery_error THEN 'SFTP_ERROR: test' END,
          s3_claimed_at = CASE WHEN fixture.backup_claim THEN delivered END,
          s3_last_error = CASE WHEN fixture.backup_error THEN 'S3_ERROR: test' END,
          sftp_attempt_count = 2, sftp_last_attempt_at = generated,
          s3_attempt_count = 1, s3_last_attempt_at = delivered,
          s3_object_key = 'reports/test.txt', record_count = 2, checksum = 'test-checksum'
      WHERE batch_id = batch;
    SELECT * INTO STRICT report FROM address_change.flat_file_status WHERE batch_id = batch;
    IF ROW(report.generation_status, report.delivery_status, report.s3_backup_status)
      IS DISTINCT FROM ROW(fixture.expected_generation, fixture.expected_delivery, fixture.expected_backup) THEN
      RAISE EXCEPTION 'Wrong lifecycle statuses for %: %, %, %', fixture,
        report.generation_status, report.delivery_status, report.s3_backup_status;
    END IF;
    IF ROW(report.content_start_at, report.content_end_at, report.partner_name,
        report.delivery_attempt_count, report.s3_attempt_count, report.record_count)
      IS DISTINCT FROM ROW(content_start, content_end, 'ICBC'::text, 2, 1, 2) THEN
      RAISE EXCEPTION 'Batch window, partner or counters were not preserved';
    END IF;
  END LOOP;
  IF ROW(report.generated_at, report.delivered_at, report.s3_backed_up_at,
      report.delivery_last_attempt_at, report.s3_last_attempt_at,
      report.s3_object_key, report.checksum)
    IS DISTINCT FROM ROW(generated, delivered, backed_up, generated, delivered,
      'reports/test.txt'::text, 'test-checksum'::text) THEN
    RAISE EXCEPTION 'Reporting timestamps or file metadata were not preserved';
  END IF;

  INSERT INTO address_change.address_change_request
    (request_id, owner_sub, idempotency_key, raw_payload_encrypted, effective_date, status, created_by, updated_by)
    VALUES
      (request, 'report-' || request::text, 'submission', decode('01', 'hex'), current_date, 'SUBMITTED', 'test', 'test'),
      (draft, 'report-' || draft::text, 'draft', decode('01', 'hex'), current_date, 'DRAFT', 'test', 'test');
  IF EXISTS (SELECT 1 FROM address_change.address_change_status WHERE request_id = draft) THEN
    RAISE EXCEPTION 'Drafts must not be reported as submitted requests';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM address_change.address_change_status
    WHERE request_id = request AND request_status = 'SUBMITTED'
      AND operation_id IS NULL AND submitted_at IS NULL AND flat_file_partner_sync_status IS NULL
      AND api_partner_sync_status IS NULL AND first_name IS NULL AND last_name IS NULL) THEN
    RAISE EXCEPTION 'Submitted requests without operations must remain visible';
  END IF;

  -- A Monday draft submitted Friday retains its original received_at. Every
  -- partner row must expose Friday's earliest operation time as submitted_at.
  UPDATE address_change.address_change_request
    SET received_at = timestamptz '2026-11-09 09:00:00+00', status = 'SUBMITTED'
    WHERE request_id = draft;
  INSERT INTO address_change.processing_operation
    (request_id, partner_id, delivery_mode, created_at)
    VALUES
      (draft, icbc, 'FLAT_FILE', timestamptz '2026-11-13 10:00:01+00'),
      (draft, health, 'REALTIME', timestamptz '2026-11-13 10:00:00+00');
  IF (SELECT count(*) FROM address_change.address_change_status
    WHERE request_id = draft
      AND received_at = timestamptz '2026-11-09 09:00:00+00'
      AND submitted_at = timestamptz '2026-11-13 10:00:00+00'
      AND submitted_at >= timestamptz '2026-11-13 00:00:00+00'
      AND submitted_at < timestamptz '2026-11-14 00:00:00+00') <> 2 THEN
    RAISE EXCEPTION 'Friday submission filter missed a Monday draft or used a per-partner timestamp';
  END IF;

  INSERT INTO address_change.request_person (request_id, first_name, last_name, date_of_birth)
    VALUES (request, 'Sḵwx̱wú7mesh', 'Test', date '1990-01-01');

  INSERT INTO address_change.processing_operation (request_id, partner_id, delivery_mode)
    VALUES (request, icbc, 'FLAT_FILE') RETURNING operation_id INTO flat_operation;
  INSERT INTO address_change.processing_operation (request_id, partner_id, delivery_mode, status)
    VALUES (request, health, 'REALTIME', 'UNKNOWN') RETURNING operation_id INTO api_operation;
  IF NOT EXISTS (SELECT 1 FROM address_change.address_change_status
    WHERE operation_id = flat_operation AND flat_file_partner_sync_status = 'PENDING'
      AND flat_file_partner_name = 'ICBC' AND api_partner_name IS NULL
      AND api_partner_sync_status IS NULL AND api_partner_sync_updated_at IS NULL
      AND flat_file_batch_id IS NULL AND flat_file_delivery_status IS NULL AND api_attempt_id IS NULL) THEN
    RAISE EXCEPTION 'Unbatched flat-file operation was not reported';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM address_change.address_change_status
    WHERE operation_id = api_operation AND api_partner_sync_status = 'UNKNOWN'
      AND api_partner_name = 'Health / MSP' AND flat_file_partner_name IS NULL
      AND flat_file_partner_sync_status IS NULL AND flat_file_partner_sync_updated_at IS NULL
      AND api_attempt_id IS NULL) THEN
    RAISE EXCEPTION 'API operation without attempts was not reported';
  END IF;

  -- Attempt number, not timestamp or outcome, defines the latest API attempt.
  INSERT INTO address_change.processing_attempt
    (operation_id, attempt_number, status, started_at, completed_at, error_code, request_payload_encrypted)
    VALUES
      (api_operation, 1, 'FAILED', delivered, backed_up, 'OLD_ERROR', decode('01', 'hex')),
      (api_operation, 2, 'TIMED_OUT', generated, delivered, 'TIMEOUT', decode('01', 'hex')),
      (flat_operation, 1, 'FAILED', generated, delivered, 'NOT_API', decode('01', 'hex'));
  IF NOT EXISTS (SELECT 1 FROM address_change.address_change_status
    WHERE operation_id = api_operation AND delivery_mode = 'REALTIME'
      AND api_attempt_number = 2 AND api_attempt_status = 'TIMED_OUT'
      AND api_error_code = 'TIMEOUT' AND api_attempt_completed_at = delivered) THEN
    RAISE EXCEPTION 'Latest API attempt was not selected by attempt_number';
  END IF;
  INSERT INTO address_change.processing_attempt (operation_id, attempt_number, request_payload_encrypted)
    VALUES (api_operation, 3, decode('01', 'hex'));
  IF NOT EXISTS (SELECT 1 FROM address_change.address_change_status
    WHERE operation_id = api_operation AND api_attempt_number = 3
      AND api_attempt_status = 'STARTED' AND api_attempt_completed_at IS NULL
      AND api_error_code IS NULL AND api_partner_sync_status = 'UNKNOWN') THEN
    RAISE EXCEPTION 'In-flight API retry or stored operation outcome was not preserved';
  END IF;
  UPDATE address_change.processing_attempt
    SET status = 'SUCCEEDED', completed_at = clock_timestamp()
    WHERE operation_id = api_operation AND attempt_number = 3;
  IF NOT EXISTS (SELECT 1 FROM address_change.address_change_status
    WHERE operation_id = api_operation AND api_attempt_status = 'SUCCEEDED'
      AND api_partner_sync_status = 'UNKNOWN' AND request_status = 'SUBMITTED') THEN
    RAISE EXCEPTION 'Reporting must not recompute stored request or operation outcomes';
  END IF;

  UPDATE address_change.processing_operation SET batch_id = batch, status = 'SUCCEEDED'
    WHERE operation_id = flat_operation;
  -- Historical operations keep their delivery mode even if configuration changes.
  UPDATE address_change.partner_system SET delivery_mode = 'REALTIME' WHERE partner_id = icbc;
  IF NOT EXISTS (SELECT 1 FROM address_change.address_change_status
    WHERE operation_id = flat_operation AND delivery_mode = 'FLAT_FILE'
      AND flat_file_partner_name = 'ICBC' AND flat_file_partner_sync_status = 'SUCCEEDED'
      AND flat_file_generation_status = 'GENERATED' AND flat_file_generated_at = generated
      AND flat_file_delivery_status = 'SENT' AND flat_file_delivered_at = delivered
      AND flat_file_s3_backup_status = 'BACKED_UP' AND flat_file_s3_backed_up_at = backed_up
      AND api_attempt_id IS NULL AND request_status = 'SUBMITTED') THEN
    RAISE EXCEPTION 'Flat-file status, operation mode or stored request status was lost';
  END IF;
  IF (SELECT count(*) FROM address_change.address_change_status WHERE request_id = request) <> 2 THEN
    RAISE EXCEPTION 'Expected exactly one row per selected partner despite multiple attempts';
  END IF;
  IF (SELECT count(*) FROM address_change.address_change_status
    WHERE request_id = request AND first_name = 'Sḵwx̱wú7mesh' AND last_name = 'Test') <> 2 THEN
    RAISE EXCEPTION 'Submitted first/last names must be preserved on every partner row';
  END IF;
  IF EXISTS (SELECT 1 FROM address_change.address_change_status
    WHERE operation_id = api_operation AND (flat_file_batch_id IS NOT NULL OR flat_file_delivery_status IS NOT NULL)) THEN
    RAISE EXCEPTION 'API operation unexpectedly exposed flat-file metadata';
  END IF;

  -- Only request reporting includes names; both omit partner IDs/codes,
  -- other resident details, payloads, file bytes and credentials.
  IF EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'address_change' AND table_name IN ('address_change_status', 'flat_file_status')
      AND column_name IN ('owner_sub', 'raw_payload_encrypted', 'request_payload_encrypted',
        'file_content', 'layout_snapshot', 'sftp_encrypted_password', 'partner_id', 'partner_code')) THEN
    RAISE EXCEPTION 'Reporting views expose unnecessary sensitive data';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'address_change' AND table_name = 'flat_file_status'
      AND column_name IN ('first_name', 'last_name')) THEN
    RAISE EXCEPTION 'Batch reporting must not expose resident names';
  END IF;
  DELETE FROM address_change.address_change_request WHERE request_id = request;
  IF EXISTS (SELECT 1 FROM address_change.address_change_status WHERE request_id = request)
    OR NOT EXISTS (SELECT 1 FROM address_change.flat_file_status
      WHERE batch_id = batch AND content_start_at = content_start AND content_end_at = content_end) THEN
    RAISE EXCEPTION 'Request purging must remove request rows without losing the batch window';
  END IF;
  RAISE NOTICE 'Status reporting view checks passed (14 lifecycle cases plus request/partner/API coverage)';
END $$;
ROLLBACK;