-- Local development sample data only; mounted by docker-compose, never shipped in the migrations image.
INSERT INTO address_change.address_change_request
  (request_id, owner_sub, idempotency_key, received_at, raw_payload_encrypted, effective_date, status, created_by, updated_by)
VALUES
  ('11111111-1111-4111-8111-111111111111', 'local-sample-owner-1', 'local-sample-1',
   timestamptz '2025-05-16 19:10:24-07', convert_to('{"sample":true}', 'UTF8'), date '2025-06-01',
   'PENDING_DELIVERY', 'local-seed', 'local-seed'),
  ('22222222-2222-4222-8222-222222222222', 'local-sample-owner-2', 'local-sample-2',
   timestamptz '2025-05-16 09:50:28-07', convert_to('{"sample":true}', 'UTF8'), date '2025-05-20',
   'PENDING_DELIVERY', 'local-seed', 'local-seed')
ON CONFLICT DO NOTHING;

INSERT INTO address_change.request_person
  (request_id, first_name, first_middle_initial, second_middle_initial, last_name, date_of_birth,
   email_address, daytime_phone, height_cm, weight_kg, created_by, updated_by)
VALUES
  ('11111111-1111-4111-8111-111111111111', 'Sḵwx̱wú7mesh', NULL, NULL, 'Svedberg', date '1989-03-16',
   'sample.one@example.com', '2505550101', NULL, NULL, 'local-seed', 'local-seed'),
  ('22222222-2222-4222-8222-222222222222', 'Minghua', 'C', 'J', 'Zhang', date '1982-03-28',
   'sample.two@example.com', '7785550102', 180, 80, 'local-seed', 'local-seed')
ON CONFLICT DO NOTHING;

INSERT INTO address_change.submitted_address
  (submitted_address_id, request_id,
   old_address_line_one, old_address_line_two, old_city, old_province, old_postal_code, old_country,
   new_address_line_one, new_address_line_two, new_city, new_province, new_postal_code, new_country,
   is_mailing_address_same,
   mailing_address_line_one, mailing_address_line_two, mailing_city, mailing_province, mailing_postal_code, mailing_country,
   created_by, updated_by)
VALUES
  ('33333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111',
   '7155 Dallas Dr', 'Unit E20', 'Kamloops', 'BC', 'V2C4T1', 'CA',
   '1128 Bentley Pl', NULL, 'Kamloops', 'BC', 'V2B5M5', 'CA',
   true, NULL, NULL, NULL, NULL, NULL, NULL, 'local-seed', 'local-seed'),
  ('44444444-4444-4444-8444-444444444444', '22222222-2222-4222-8222-222222222222',
   '1228 Hudson St', 'Unit 51', 'Coquitlam', 'BC', 'V3B0R3', 'CA',
   '188 Sixth St', 'Unit 19', 'New Westminster', 'BC', 'V3L2Z9', 'CA',
   false, 'PO Box 3115', NULL, 'Coquitlam', 'BC', 'V3B0R3', 'CA', 'local-seed', 'local-seed')
ON CONFLICT DO NOTHING;

INSERT INTO address_change.processing_operation (request_id, partner_id, delivery_mode, status, created_by, updated_by)
SELECT r.request_id, p.partner_id, p.delivery_mode, 'PENDING', 'local-seed', 'local-seed'
FROM address_change.address_change_request r
CROSS JOIN address_change.partner_system p
WHERE r.request_id IN ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222')
  AND p.delivery_mode = 'FLAT_FILE'
ON CONFLICT DO NOTHING;

-- Points both partners at the local `sftp` compose service (password "localpass").
-- The password is encrypted with the throwaway local-only key
-- SFTP_CREDENTIAL_ENCRYPTION_KEY=gdxNFKnHOBe947MQ19SOfeAusFG5BwJHwVlzHa8jBA0= (never use outside local dev).
UPDATE address_change.partner_system
SET sftp_host = 'localhost',
    sftp_port = 2222,
    sftp_username = 'sample-' || lower(partner_code),
    sftp_auth_method = 'PASSWORD',
    sftp_encrypted_password = '\x017a5d59c21034f157d1c7076cf425cea6fb69dcf14ab2fb462dfbb8436a21c71de2d25ce656'::bytea,
    sftp_key_path = NULL,
    sftp_remote_directory = '/inbound',
    updated_at = now(),
    updated_by = 'local-seed';
