ALTER TABLE address_change.partner_system
  ADD COLUMN include_header boolean NOT NULL DEFAULT false,
  ADD COLUMN flat_file_encoding text NOT NULL DEFAULT 'UTF-8'
    CHECK (flat_file_encoding IN ('UTF-8', 'US-ASCII'));

ALTER TABLE address_change.submitted_address
  ADD COLUMN old_address_flag text,
  ADD COLUMN old_unit_number text,
  ADD COLUMN old_street_number text,
  ADD COLUMN old_street_suffix text,
  ADD COLUMN old_street_name text,
  ADD COLUMN old_street_type text,
  ADD COLUMN old_street_direction text,
  ADD COLUMN new_address_flag text,
  ADD COLUMN new_unit_number text,
  ADD COLUMN new_street_number text,
  ADD COLUMN new_street_suffix text,
  ADD COLUMN new_street_name text,
  ADD COLUMN new_street_type text,
  ADD COLUMN new_street_direction text,
  ADD COLUMN mailing_address_flag text,
  ADD COLUMN mailing_unit_number text,
  ADD COLUMN mailing_street_number text,
  ADD COLUMN mailing_street_suffix text,
  ADD COLUMN mailing_street_name text,
  ADD COLUMN mailing_street_type text,
  ADD COLUMN mailing_street_direction text;

ALTER TABLE address_change.flat_file_batch
  ADD COLUMN first_request_received_at timestamptz,
  ADD COLUMN last_request_received_at timestamptz,
  ADD COLUMN layout_snapshot jsonb,
  ADD COLUMN s3_backed_up_at timestamptz,
  ADD COLUMN s3_object_key text;

COMMENT ON COLUMN address_change.partner_system.include_header IS
  'Whether generated partner flat files include a header row.';
COMMENT ON COLUMN address_change.partner_system.flat_file_encoding IS
  'Output encoding for partner flat files: UTF-8 or strict US-ASCII.';
COMMENT ON COLUMN address_change.flat_file_batch.layout_snapshot IS
  'Ordered partner column configuration used to generate this immutable file.';
COMMENT ON COLUMN address_change.flat_file_batch.s3_object_key IS
  'Object key of the exact generated file archived in the configured S3 bucket.';

CREATE TABLE address_change.partner_flat_file_column (
  partner_id uuid NOT NULL REFERENCES address_change.partner_system(partner_id),
  position integer NOT NULL CHECK (position > 0),
  field_key text NOT NULL CHECK (field_key ~ '^[a-z][a-z0-9_]*$'),
  column_name text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  min_width integer NOT NULL DEFAULT 0 CHECK (min_width >= 0),
  format text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL DEFAULT current_user,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL DEFAULT current_user,
  PRIMARY KEY (partner_id, position)
);

CREATE INDEX partner_flat_file_column_lookup_idx
  ON address_change.partner_flat_file_column(partner_id, enabled, position);

CREATE VIEW address_change.flat_file_source AS
SELECT
  r.request_id,
  r.received_at AS submission_timestamp,
  r.effective_date AS move_date,
  p.last_name,
  p.first_name,
  NULLIF(CONCAT_WS(' ', NULLIF(BTRIM(p.first_middle_initial), ''),
                            NULLIF(BTRIM(p.second_middle_initial), '')), '') AS middle_initials,
  p.date_of_birth,
  a.old_address_flag,
  a.old_unit_number,
  a.old_street_number,
  a.old_street_suffix,
  a.old_street_name,
  a.old_street_type,
  a.old_street_direction,
  a.old_city,
  a.old_province,
  a.old_postal_code,
  a.old_address_line_one,
  a.old_address_line_two,
  a.old_country,
  a.new_address_flag,
  a.new_unit_number,
  a.new_street_number,
  a.new_street_suffix,
  a.new_street_name,
  a.new_street_type,
  a.new_street_direction,
  a.new_city,
  a.new_province,
  a.new_postal_code,
  a.new_address_line_one,
  a.new_address_line_two,
  a.new_country,
  p.daytime_phone,
  p.email_address,
  a.mailing_address_flag,
  a.mailing_unit_number,
  a.mailing_street_number,
  a.mailing_street_suffix,
  a.mailing_street_name,
  a.mailing_street_type,
  a.mailing_street_direction,
  a.mailing_city,
  a.mailing_province,
  a.mailing_postal_code,
  a.mailing_address_line_one,
  a.mailing_address_line_two,
  a.mailing_country,
  p.drivers_license_number_encrypted AS drivers_license_number,
  p.height_cm,
  p.weight_kg,
  p.security_keyword_encrypted AS security_keyword,
  p.phn_encrypted AS phn
FROM address_change.address_change_request r
JOIN address_change.request_person p USING (request_id)
JOIN address_change.submitted_address a USING (request_id);

-- Common fields and their partner-specific order are data, not generator code.
INSERT INTO address_change.partner_flat_file_column
  (partner_id, position, field_key, column_name, min_width, format, created_by, updated_by)
SELECT p.partner_id, c.position, c.field_key, c.column_name, c.min_width, c.format, 'migration', 'migration'
FROM address_change.partner_system p
CROSS JOIN (VALUES
  (1, 'submission_timestamp', 'Submission timestamp', 14, 'YYYYMMDDHHmmss'),
  (2, 'move_date', 'Move date', 8, 'YYYYMMDD'),
  (3, 'last_name', 'Last name', 0, NULL),
  (4, 'first_name', 'First name', 0, NULL),
  (5, 'middle_initials', 'Middle initials', 0, NULL),
  (6, 'date_of_birth', 'Date of birth', 8, 'YYYYMMDD'),
  (7, 'old_address_flag', 'Old address flag', 1, NULL),
  (8, 'old_unit_number', 'Old unit / suite number', 0, NULL),
  (9, 'old_street_number', 'Old street number', 0, NULL),
  (10, 'old_street_suffix', 'Old street suffix', 0, NULL),
  (11, 'old_street_name', 'Old street name', 0, NULL),
  (12, 'old_street_type', 'Old street type', 0, NULL),
  (13, 'old_street_direction', 'Old street direction', 0, NULL),
  (14, 'old_city', 'Old city / locality', 0, NULL),
  (15, 'old_province', 'Old province / state', 2, NULL),
  (16, 'old_postal_code', 'Old postal code', 6, NULL),
  (17, 'old_address_line_one', 'Old address line 1 (manual)', 0, NULL),
  (18, 'old_address_line_two', 'Old address line 2 (manual)', 0, NULL),
  (19, 'old_country', 'Old country (manual)', 0, NULL),
  (20, 'new_address_flag', 'New address flag', 1, NULL),
  (21, 'new_unit_number', 'New unit / suite number', 0, NULL),
  (22, 'new_street_number', 'New street number', 0, NULL),
  (23, 'new_street_suffix', 'New street suffix', 0, NULL),
  (24, 'new_street_name', 'New street name', 0, NULL),
  (25, 'new_street_type', 'New street type', 0, NULL),
  (26, 'new_street_direction', 'New street direction', 0, NULL),
  (27, 'new_city', 'New city / locality', 0, NULL),
  (28, 'new_province', 'New province / state', 2, NULL),
  (29, 'new_postal_code', 'New postal code', 6, NULL),
  (30, 'new_address_line_one', 'New address line 1 (manual)', 0, NULL),
  (31, 'new_address_line_two', 'New address line 2 (manual)', 0, NULL),
  (32, 'new_country', 'New country (manual)', 0, NULL),
  (33, 'daytime_phone', 'Daytime telephone', 0, NULL),
  (34, 'email_address', 'Email address', 0, NULL)
) AS c(position, field_key, column_name, min_width, format)
WHERE p.partner_code = 'ICBC';

INSERT INTO address_change.partner_flat_file_column
  (partner_id, position, field_key, column_name, min_width, format, created_by, updated_by)
SELECT p.partner_id, c.position, c.field_key, c.column_name, c.min_width, c.format, 'migration', 'migration'
FROM address_change.partner_system p
CROSS JOIN (VALUES
  (1, 'submission_timestamp', 'Submission timestamp', 14, 'YYYYMMDDHHmmss'),
  (2, 'move_date', 'Move date', 8, 'YYYYMMDD'),
  (3, 'last_name', 'Last name', 0, NULL),
  (4, 'first_name', 'First name', 0, NULL),
  (5, 'middle_initials', 'Middle initials', 0, NULL),
  (6, 'date_of_birth', 'Date of birth', 8, 'YYYYMMDD'),
  (7, 'old_address_flag', 'Old address flag', 1, NULL),
  (8, 'old_unit_number', 'Old unit / suite number', 0, NULL),
  (9, 'old_street_number', 'Old street number', 0, NULL),
  (10, 'old_street_suffix', 'Old street suffix', 0, NULL),
  (11, 'old_street_name', 'Old street name', 0, NULL),
  (12, 'old_street_type', 'Old street type', 0, NULL),
  (13, 'old_street_direction', 'Old street direction', 0, NULL),
  (14, 'old_city', 'Old city / locality', 0, NULL),
  (15, 'old_province', 'Old province / state', 2, NULL),
  (16, 'old_postal_code', 'Old postal code', 6, NULL),
  (17, 'old_address_line_one', 'Old address line 1 (manual)', 0, NULL),
  (18, 'old_address_line_two', 'Old address line 2 (manual)', 0, NULL),
  (19, 'old_country', 'Old country (manual)', 0, NULL),
  (20, 'new_address_flag', 'New address flag', 1, NULL),
  (21, 'new_unit_number', 'New unit / suite number', 0, NULL),
  (22, 'new_street_number', 'New street number', 0, NULL),
  (23, 'new_street_suffix', 'New street suffix', 0, NULL),
  (24, 'new_street_name', 'New street name', 0, NULL),
  (25, 'new_street_type', 'New street type', 0, NULL),
  (26, 'new_street_direction', 'New street direction', 0, NULL),
  (27, 'new_city', 'New city / locality', 0, NULL),
  (28, 'new_province', 'New province / state', 2, NULL),
  (29, 'new_postal_code', 'New postal code', 6, NULL),
  (30, 'new_address_line_one', 'New address line 1 (manual)', 0, NULL),
  (31, 'new_address_line_two', 'New address line 2 (manual)', 0, NULL),
  (32, 'new_country', 'New country (manual)', 0, NULL),
  (33, 'daytime_phone', 'Daytime telephone', 0, NULL),
  (34, 'email_address', 'Email address', 0, NULL),
  (35, 'mailing_address_flag', 'Mailing address flag', 1, NULL),
  (36, 'mailing_unit_number', 'Mailing unit / suite number', 0, NULL),
  (37, 'mailing_street_number', 'Mailing street number', 0, NULL),
  (38, 'mailing_street_suffix', 'Mailing street suffix', 0, NULL),
  (39, 'mailing_street_name', 'Mailing street name', 0, NULL),
  (40, 'mailing_street_type', 'Mailing street type', 0, NULL),
  (41, 'mailing_street_direction', 'Mailing street direction', 0, NULL),
  (42, 'mailing_city', 'Mailing city / locality', 0, NULL),
  (43, 'mailing_province', 'Mailing province / state', 2, NULL),
  (44, 'mailing_postal_code', 'Mailing postal code', 6, NULL),
  (45, 'mailing_address_line_one', 'Mailing address line 1 (manual)', 0, NULL),
  (46, 'mailing_address_line_two', 'Mailing address line 2 (manual)', 0, NULL),
  (47, 'mailing_country', 'Mailing country (manual)', 0, NULL),
  (48, 'phn', 'Personal health number (PHN)', 10, NULL)
) AS c(position, field_key, column_name, min_width, format)
WHERE p.partner_code = 'HEALTH';
