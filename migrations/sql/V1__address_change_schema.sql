-- PostgreSQL 18. Flyway owns the transaction; for psql use --single-transaction.
SET client_encoding = 'UTF8';
DO $$ BEGIN
  IF current_setting('server_encoding') <> 'UTF8' THEN
    RAISE EXCEPTION 'Address Change requires a UTF8 database';
  END IF;
END $$;
CREATE SCHEMA IF NOT EXISTS address_change;

CREATE TABLE address_change.partner_system (
  partner_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_code text COLLATE "C" NOT NULL UNIQUE,
  partner_name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  delivery_mode text NOT NULL CHECK (delivery_mode IN ('FLAT_FILE', 'REALTIME'))
);

CREATE TABLE address_change.address_change_request (
  request_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_sub text COLLATE "C" NOT NULL CHECK (length(owner_sub) > 0),
  idempotency_key text COLLATE "C" NOT NULL CHECK (length(idempotency_key) > 0),
  received_at timestamptz NOT NULL DEFAULT now(),
  raw_payload_encrypted bytea NOT NULL CHECK (octet_length(raw_payload_encrypted) > 0),
  effective_date date NOT NULL,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL,
  UNIQUE (owner_sub, idempotency_key),
  CHECK (closed_at IS NULL OR closed_at >= created_at)
);
CREATE UNIQUE INDEX one_active_request_per_owner
  ON address_change.address_change_request(owner_sub) WHERE closed_at IS NULL;
CREATE INDEX request_retention_idx ON address_change.address_change_request(created_at);

CREATE TABLE address_change.submitted_address (
  submitted_address_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL UNIQUE REFERENCES address_change.address_change_request ON DELETE CASCADE,
  old_address_line_one text NOT NULL,
  old_address_line_two text,
  old_city text NOT NULL,
  old_province text NOT NULL,
  old_postal_code text NOT NULL,
  old_country text NOT NULL,
  new_address_line_one text NOT NULL,
  new_address_line_two text,
  new_city text NOT NULL,
  new_province text NOT NULL,
  new_postal_code text NOT NULL,
  new_country text NOT NULL,
  is_billing_address_same boolean NOT NULL,
  billing_address_line_one text,
  billing_address_line_two text,
  billing_city text,
  billing_province text,
  billing_postal_code text,
  billing_country text,
  CHECK (is_billing_address_same OR (
    billing_address_line_one IS NOT NULL AND billing_city IS NOT NULL AND
    billing_province IS NOT NULL AND billing_postal_code IS NOT NULL AND billing_country IS NOT NULL))
);

CREATE TABLE address_change.request_person (
  request_id uuid PRIMARY KEY REFERENCES address_change.address_change_request ON DELETE CASCADE,
  first_name text NOT NULL,
  first_middle_initial text,
  second_middle_initial text,
  last_name text NOT NULL,
  date_of_birth date NOT NULL,
  email_address text,
  daytime_phone text,
  drivers_license_number_encrypted bytea,
  height_cm numeric CHECK (height_cm > 0),
  weight_kg numeric CHECK (weight_kg > 0),
  phn_encrypted bytea,
  security_keyword_encrypted bytea
);

CREATE TABLE address_change.flat_file_batch (
  batch_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES address_change.partner_system,
  file_date date NOT NULL,
  status text NOT NULL DEFAULT 'BUILDING'
    CHECK (status IN ('BUILDING', 'READY', 'SENT', 'ACKNOWLEDGED', 'FAILED', 'UNKNOWN')),
  file_name text,
  record_count integer NOT NULL DEFAULT 0 CHECK (record_count >= 0),
  checksum text,
  sftp_status text NOT NULL DEFAULT 'NOT_STARTED'
    CHECK (sftp_status IN ('NOT_STARTED', 'IN_PROGRESS', 'SUCCEEDED', 'FAILED', 'UNKNOWN')),
  created_at timestamptz NOT NULL DEFAULT now(),
  generated_at timestamptz,
  transferred_at timestamptz,
  acknowledged_at timestamptz,
  UNIQUE (batch_id, partner_id),
  UNIQUE (partner_id, file_name)
);
CREATE INDEX batch_partner_date_idx ON address_change.flat_file_batch(partner_id, file_date);

CREATE TABLE address_change.processing_operation (
  operation_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES address_change.address_change_request ON DELETE CASCADE,
  batch_id uuid,
  partner_id uuid NOT NULL REFERENCES address_change.partner_system,
  delivery_mode text NOT NULL CHECK (delivery_mode IN ('FLAT_FILE', 'REALTIME')),
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'IN_PROGRESS', 'SENT', 'SUCCEEDED', 'FAILED', 'UNKNOWN', 'CANCELLED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (request_id, partner_id),
  FOREIGN KEY (batch_id, partner_id) REFERENCES address_change.flat_file_batch(batch_id, partner_id),
  CHECK (batch_id IS NULL OR delivery_mode = 'FLAT_FILE'),
  CHECK (status <> 'SENT' OR (delivery_mode = 'FLAT_FILE' AND batch_id IS NOT NULL))
);
CREATE INDEX operation_batch_idx ON address_change.processing_operation(batch_id, partner_id);
CREATE INDEX operation_dispatch_idx ON address_change.processing_operation(partner_id, delivery_mode, status);

CREATE TABLE address_change.processing_attempt (
  attempt_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL REFERENCES address_change.processing_operation ON DELETE CASCADE,
  attempt_number integer NOT NULL CHECK (attempt_number > 0),
  status text NOT NULL DEFAULT 'STARTED'
    CHECK (status IN ('STARTED', 'SUCCEEDED', 'FAILED', 'TIMED_OUT')),
  request_payload_encrypted bytea NOT NULL CHECK (octet_length(request_payload_encrypted) > 0),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  error_code text,
  UNIQUE (operation_id, attempt_number),
  CHECK ((status = 'STARTED' AND completed_at IS NULL) OR
         (status <> 'STARTED' AND completed_at IS NOT NULL)),
  CHECK (completed_at IS NULL OR completed_at >= started_at)
);
CREATE UNIQUE INDEX one_started_attempt_per_operation
  ON address_change.processing_attempt(operation_id) WHERE status = 'STARTED';

-- Serialize partner-operation changes for a request; never hold this lock over HTTP.
CREATE FUNCTION address_change.guard_operation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_closed timestamptz;
BEGIN
  SELECT closed_at INTO parent_closed FROM address_change.address_change_request
    WHERE request_id = NEW.request_id FOR UPDATE;
  IF parent_closed IS NOT NULL THEN
    RAISE EXCEPTION 'Closed request cannot receive new or changed operations';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'PENDING' THEN RAISE EXCEPTION 'New operation must start PENDING'; END IF;
  ELSE
    IF NEW.request_id <> OLD.request_id OR NEW.partner_id <> OLD.partner_id OR
       NEW.delivery_mode <> OLD.delivery_mode THEN
      RAISE EXCEPTION 'Operation owner, partner and delivery mode are immutable';
    END IF;
    IF OLD.status IN ('SUCCEEDED', 'CANCELLED') AND NEW IS DISTINCT FROM OLD THEN
      RAISE EXCEPTION 'Terminal operation is immutable';
    END IF;
  END IF;
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END $$;
CREATE TRIGGER operation_guard BEFORE INSERT OR UPDATE ON address_change.processing_operation
  FOR EACH ROW EXECUTE FUNCTION address_change.guard_operation();

-- Lifecycle marker only: overall business status is calculated by the view below.
CREATE FUNCTION address_change.close_finished_request() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM address_change.processing_operation
    WHERE request_id = NEW.request_id AND status NOT IN ('SUCCEEDED', 'CANCELLED')) THEN
    UPDATE address_change.address_change_request
      SET closed_at = clock_timestamp(), updated_by = 'operation-status-trigger'
      WHERE request_id = NEW.request_id AND closed_at IS NULL;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER operation_completion AFTER UPDATE OF status ON address_change.processing_operation
  FOR EACH ROW EXECUTE FUNCTION address_change.close_finished_request();

CREATE FUNCTION address_change.guard_request() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.closed_at IS NOT NULL THEN RAISE EXCEPTION 'New request must be open'; END IF;
  ELSE
    IF NEW.owner_sub <> OLD.owner_sub OR NEW.idempotency_key <> OLD.idempotency_key OR
       NEW.raw_payload_encrypted <> OLD.raw_payload_encrypted OR
       NEW.effective_date <> OLD.effective_date OR NEW.created_at <> OLD.created_at OR
       NEW.request_id <> OLD.request_id THEN
      RAISE EXCEPTION 'Submitted request identity and content are immutable';
    END IF;
    IF OLD.closed_at IS NOT NULL AND NEW.closed_at IS DISTINCT FROM OLD.closed_at THEN
      RAISE EXCEPTION 'Closed request cannot be reopened';
    END IF;
    IF OLD.closed_at IS NULL AND NEW.closed_at IS NOT NULL AND (
      NOT EXISTS (SELECT 1 FROM address_change.processing_operation WHERE request_id = NEW.request_id)
      OR EXISTS (SELECT 1 FROM address_change.processing_operation
        WHERE request_id = NEW.request_id AND status NOT IN ('SUCCEEDED', 'CANCELLED'))) THEN
      RAISE EXCEPTION 'Close outstanding operations before closing request';
    END IF;
  END IF;
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END $$;
CREATE TRIGGER request_guard BEFORE INSERT OR UPDATE ON address_change.address_change_request
  FOR EACH ROW EXECUTE FUNCTION address_change.guard_request();

-- Intake must commit the request, its person/address snapshot and selected partners together.
CREATE FUNCTION address_change.check_complete_intake() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM address_change.address_change_request WHERE request_id = NEW.request_id) AND (
    NOT EXISTS (SELECT 1 FROM address_change.request_person WHERE request_id = NEW.request_id) OR
    NOT EXISTS (SELECT 1 FROM address_change.submitted_address WHERE request_id = NEW.request_id) OR
    NOT EXISTS (SELECT 1 FROM address_change.processing_operation WHERE request_id = NEW.request_id)) THEN
    RAISE EXCEPTION 'Request requires person, address and at least one partner operation';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER complete_intake AFTER INSERT ON address_change.address_change_request
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION address_change.check_complete_intake();

CREATE VIEW address_change.request_status AS
SELECT r.request_id, r.owner_sub, r.created_at, r.closed_at,
  count(o.operation_id) AS operation_count,
  count(*) FILTER (WHERE o.status = 'SUCCEEDED') AS succeeded_count,
  CASE
    WHEN count(o.operation_id) = 0 THEN 'SUBMITTED'
    WHEN bool_and(o.status = 'SUCCEEDED') THEN 'COMPLETED'
    WHEN r.closed_at IS NOT NULL THEN 'CLOSED'
    WHEN bool_or(o.status = 'IN_PROGRESS') THEN 'PROCESSING'
    WHEN bool_or(o.status = 'SUCCEEDED') THEN 'PARTIALLY_COMPLETED'
    WHEN bool_or(o.status IN ('UNKNOWN', 'SENT')) THEN 'PENDING_CONFIRMATION'
    WHEN bool_or(o.status = 'PENDING') THEN 'PENDING_DELIVERY'
    ELSE 'FAILED'
  END AS status
FROM address_change.address_change_request r
LEFT JOIN address_change.processing_operation o USING (request_id)
GROUP BY r.request_id;

INSERT INTO address_change.partner_system (partner_code, partner_name, delivery_mode)
VALUES ('ICBC', 'ICBC', 'FLAT_FILE'), ('HEALTH', 'Health / MSP', 'FLAT_FILE');

COMMENT ON COLUMN address_change.address_change_request.owner_sub IS
  'Exact subject from a validated token under the one-configured-issuer contract; never a token.';
COMMENT ON COLUMN address_change.address_change_request.closed_at IS
  'Lifecycle marker for unique active-owner index; automatically set after all operations succeed or are cancelled.';
COMMENT ON COLUMN address_change.address_change_request.raw_payload_encrypted IS
  'Application-encrypted UTF-8 JSON envelope including key version, nonce and authentication tag. No tokens or headers.';
COMMENT ON COLUMN address_change.processing_attempt.request_payload_encrypted IS
  'Application-encrypted exact outbound API body; no bearer tokens. Not evidence of partner receipt.';
COMMENT ON COLUMN address_change.processing_operation.batch_id IS
  'Single batch membership for MVP. Replacing this loses previous membership; use linking history before regeneration.';
COMMENT ON TABLE address_change.submitted_address IS
  'UTF-8 submitted values preserved verbatim. No transliteration or ASCII-only validation. Application keeps snapshots immutable.';
