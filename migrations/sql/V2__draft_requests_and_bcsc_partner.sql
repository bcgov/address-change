-- Draft requests and the BC Services Card partner.
-- A DRAFT row holds only the encrypted, partially completed form in raw_payload_encrypted.
-- Person, address and operation rows are written when the draft is submitted (DRAFT -> PENDING).
INSERT INTO address_change.status_type (status_category, status_code, display_name)
VALUES ('REQUEST', 'DRAFT', 'Draft'), ('REQUEST', 'PENDING', 'Pending');

ALTER TABLE address_change.address_change_request ALTER COLUMN effective_date DROP NOT NULL;
ALTER TABLE address_change.address_change_request
  ADD CONSTRAINT effective_date_required_unless_draft
  CHECK (status = 'DRAFT' OR effective_date IS NOT NULL);

INSERT INTO address_change.partner_system (partner_code, partner_name, delivery_mode)
VALUES ('BCSC', 'BC Services Card', 'REALTIME');

COMMENT ON COLUMN address_change.address_change_request.effective_date IS
  'Required once submitted; NULL is allowed only while the request is a DRAFT.';
