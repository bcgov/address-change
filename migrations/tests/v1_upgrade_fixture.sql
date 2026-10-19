-- Synthetic committed fixture: disposable V1 database ONLY, before applying V2.
BEGIN;
DO $$
DECLARE
  r uuid;
  partner uuid;
  batch uuid;
BEGIN
  SELECT partner_id INTO STRICT partner FROM address_change.partner_system WHERE partner_code = 'ICBC';
  INSERT INTO address_change.address_change_request
    (owner_sub, idempotency_key, raw_payload_encrypted, effective_date, created_by, updated_by)
    VALUES ('upgrade-fixture-owner', 'fixture-key', decode('01', 'hex'), current_date,
      'fixture-actor', 'fixture-actor') RETURNING request_id INTO r;
  INSERT INTO address_change.request_person(request_id, first_name, last_name, date_of_birth)
    VALUES (r, 'Synthetic', 'Fixture', date '1990-01-01');
  INSERT INTO address_change.submitted_address
    (request_id, old_address_line_one, old_city, old_province, old_postal_code, old_country,
     new_address_line_one, new_city, new_province, new_postal_code, new_country, is_billing_address_same)
    VALUES (r, 'Test', 'Test', 'BC', 'V0A 0A0', 'CA', 'Test', 'Test', 'BC', 'V0A 0A0', 'CA', true);
  INSERT INTO address_change.flat_file_batch
    (partner_id, file_date, status, sftp_status, file_name, record_count)
    VALUES (partner, current_date, 'ACKNOWLEDGED', 'SUCCEEDED', 'synthetic-fixture.txt', 1)
    RETURNING batch_id INTO batch;
  INSERT INTO address_change.processing_operation(request_id, partner_id, delivery_mode, batch_id)
    VALUES (r, partner, 'FLAT_FILE', batch);
  UPDATE address_change.processing_operation SET status = 'SENT' WHERE request_id = r;
END $$;
COMMIT;
