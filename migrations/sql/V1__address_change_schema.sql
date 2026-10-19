-- PostgreSQL 18. Flyway owns the transaction; for psql use --single-transaction.
SET client_encoding = 'UTF8';
DO $$ BEGIN
  IF current_setting('server_encoding') <> 'UTF8' THEN
    RAISE EXCEPTION 'Address Change requires a UTF8 database';
  END IF;
END $$;
CREATE SCHEMA IF NOT EXISTS address_change;

CREATE TABLE address_change.status_type (
  status_category text NOT NULL,
  status_code text NOT NULL,
  display_name text NOT NULL,
  description text,
  active boolean NOT NULL DEFAULT true,
  PRIMARY KEY (status_category, status_code),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL DEFAULT current_user,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL DEFAULT current_user
);
INSERT INTO address_change.status_type (status_category, status_code, display_name)
SELECT category, code, initcap(replace(code, '_', ' '))
FROM (VALUES
  ('REQUEST', 'SUBMITTED'), ('REQUEST', 'PROCESSING'),
  ('REQUEST', 'PENDING_DELIVERY'), ('REQUEST', 'PENDING_CONFIRMATION'),
  ('REQUEST', 'PARTIALLY_COMPLETED'), ('REQUEST', 'COMPLETED'),
  ('REQUEST', 'FAILED'), ('REQUEST', 'CLOSED'),
  ('OPERATION', 'PENDING'), ('OPERATION', 'IN_PROGRESS'),
  ('OPERATION', 'SUCCEEDED'), ('OPERATION', 'FAILED'),
  ('OPERATION', 'UNKNOWN'), ('OPERATION', 'CANCELLED'),
  ('ATTEMPT', 'STARTED'), ('ATTEMPT', 'SUCCEEDED'),
  ('ATTEMPT', 'FAILED'), ('ATTEMPT', 'TIMED_OUT'),
  ('BATCH', 'BUILDING'), ('BATCH', 'READY'), ('BATCH', 'TRANSFERRING'),
  ('BATCH', 'SENT'), ('BATCH', 'FAILED'), ('BATCH', 'UNKNOWN')
) AS seeds(category, code);

CREATE TABLE address_change.partner_system (
  partner_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_code text COLLATE "C" NOT NULL UNIQUE,
  partner_name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  delivery_mode text NOT NULL CHECK (delivery_mode IN ('FLAT_FILE', 'REALTIME')),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL DEFAULT current_user,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL DEFAULT current_user
);

CREATE TABLE address_change.address_change_request (
  request_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_sub text COLLATE "C" NOT NULL CHECK (length(owner_sub) > 0),
  idempotency_key text COLLATE "C" NOT NULL CHECK (length(idempotency_key) > 0),
  received_at timestamptz NOT NULL DEFAULT now(),
  raw_payload_encrypted bytea NOT NULL CHECK (octet_length(raw_payload_encrypted) > 0),
  effective_date date NOT NULL,
  status text NOT NULL DEFAULT 'SUBMITTED',
  status_category text GENERATED ALWAYS AS ('REQUEST'::text) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL,
  UNIQUE (owner_sub, idempotency_key),
  CONSTRAINT request_status_fk FOREIGN KEY (status_category, status)
    REFERENCES address_change.status_type (status_category, status_code)
);
CREATE UNIQUE INDEX one_active_request_per_owner
  ON address_change.address_change_request(owner_sub) WHERE status NOT IN ('COMPLETED', 'CLOSED');
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
    billing_province IS NOT NULL AND billing_postal_code IS NOT NULL AND billing_country IS NOT NULL)),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL DEFAULT current_user,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL DEFAULT current_user
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
  security_keyword_encrypted bytea,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL DEFAULT current_user,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL DEFAULT current_user
);

CREATE TABLE address_change.flat_file_batch (
  batch_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES address_change.partner_system,
  file_date date NOT NULL,
  status text NOT NULL DEFAULT 'BUILDING',
  status_category text GENERATED ALWAYS AS ('BATCH'::text) STORED,
  CONSTRAINT batch_status_fk FOREIGN KEY (status_category, status)
    REFERENCES address_change.status_type (status_category, status_code),
  file_name text,
  record_count integer NOT NULL DEFAULT 0 CHECK (record_count >= 0),
  checksum text,
  created_at timestamptz NOT NULL DEFAULT now(),
  generated_at timestamptz,
  transferred_at timestamptz,
  UNIQUE (batch_id, partner_id),
  UNIQUE (partner_id, file_name),
  created_by text NOT NULL DEFAULT current_user,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL DEFAULT current_user
);
CREATE INDEX batch_partner_date_idx ON address_change.flat_file_batch(partner_id, file_date);

CREATE TABLE address_change.processing_operation (
  operation_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES address_change.address_change_request ON DELETE CASCADE,
  batch_id uuid,
  partner_id uuid NOT NULL REFERENCES address_change.partner_system,
  delivery_mode text NOT NULL CHECK (delivery_mode IN ('FLAT_FILE', 'REALTIME')),
  status text NOT NULL DEFAULT 'PENDING',
  status_category text GENERATED ALWAYS AS ('OPERATION'::text) STORED,
  CONSTRAINT operation_status_fk FOREIGN KEY (status_category, status)
    REFERENCES address_change.status_type (status_category, status_code),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (request_id, partner_id),
  FOREIGN KEY (batch_id, partner_id) REFERENCES address_change.flat_file_batch(batch_id, partner_id),
  CHECK (batch_id IS NULL OR delivery_mode = 'FLAT_FILE'),
  created_by text NOT NULL DEFAULT current_user,
  updated_by text NOT NULL DEFAULT current_user
);
CREATE INDEX operation_batch_idx ON address_change.processing_operation(batch_id, partner_id);
CREATE INDEX operation_dispatch_idx ON address_change.processing_operation(partner_id, delivery_mode, status);

CREATE TABLE address_change.processing_attempt (
  attempt_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL REFERENCES address_change.processing_operation ON DELETE CASCADE,
  attempt_number integer NOT NULL CHECK (attempt_number > 0),
  status text NOT NULL DEFAULT 'STARTED',
  status_category text GENERATED ALWAYS AS ('ATTEMPT'::text) STORED,
  CONSTRAINT attempt_status_fk FOREIGN KEY (status_category, status)
    REFERENCES address_change.status_type (status_category, status_code),
  request_payload_encrypted bytea NOT NULL CHECK (octet_length(request_payload_encrypted) > 0),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  error_code text,
  UNIQUE (operation_id, attempt_number),
  CHECK ((status = 'STARTED' AND completed_at IS NULL) OR
         (status <> 'STARTED' AND completed_at IS NOT NULL)),
  CHECK (completed_at IS NULL OR completed_at >= started_at),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL DEFAULT current_user,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL DEFAULT current_user
);
CREATE UNIQUE INDEX one_started_attempt_per_operation
  ON address_change.processing_attempt(operation_id) WHERE status = 'STARTED';

CREATE FUNCTION address_change.calculate_request_status(target_request uuid)
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN count(*) = 0 THEN 'SUBMITTED'
    WHEN bool_and(status = 'SUCCEEDED') THEN 'COMPLETED'
    WHEN bool_and(status IN ('SUCCEEDED', 'CANCELLED')) THEN 'CLOSED'
    WHEN bool_or(status = 'IN_PROGRESS') THEN 'PROCESSING'
    WHEN bool_or(status = 'SUCCEEDED') THEN 'PARTIALLY_COMPLETED'
    WHEN bool_or(status = 'UNKNOWN') THEN 'PENDING_CONFIRMATION'
    WHEN bool_or(status = 'PENDING') THEN 'PENDING_DELIVERY'
    ELSE 'FAILED' END
  FROM address_change.processing_operation WHERE request_id = target_request;
$$;
CREATE FUNCTION address_change.set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END $$;
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['status_type', 'partner_system',
    'address_change_request', 'submitted_address', 'request_person',
    'flat_file_batch', 'processing_operation', 'processing_attempt'] LOOP
    -- z_ runs after guards so timestamp mutation does not affect their comparisons.
    EXECUTE format('CREATE TRIGGER z_set_updated_at BEFORE UPDATE ON address_change.%I
      FOR EACH ROW EXECUTE FUNCTION address_change.set_updated_at()', table_name);
  END LOOP;
END $$;

CREATE FUNCTION address_change.guard_operation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_status text;
BEGIN
  SELECT status INTO parent_status FROM address_change.address_change_request
    WHERE request_id = NEW.request_id FOR UPDATE;
  IF parent_status IN ('COMPLETED', 'CLOSED') THEN
    RAISE EXCEPTION 'Terminal request cannot receive new or changed operations';
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
  RETURN NEW;
END $$;
CREATE TRIGGER operation_guard BEFORE INSERT OR UPDATE ON address_change.processing_operation
  FOR EACH ROW EXECUTE FUNCTION address_change.guard_operation();

CREATE FUNCTION address_change.guard_request() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'SUBMITTED' THEN RAISE EXCEPTION 'New request must start SUBMITTED'; END IF;
  ELSE
    IF NEW.owner_sub <> OLD.owner_sub OR NEW.idempotency_key <> OLD.idempotency_key OR
       NEW.raw_payload_encrypted <> OLD.raw_payload_encrypted OR
       NEW.effective_date <> OLD.effective_date OR NEW.created_at <> OLD.created_at OR
       NEW.request_id <> OLD.request_id THEN
      RAISE EXCEPTION 'Submitted request identity and content are immutable';
    END IF;
    IF OLD.status IN ('COMPLETED', 'CLOSED') AND NEW.status <> OLD.status THEN
      RAISE EXCEPTION 'Terminal request cannot be reopened';
    END IF;
    IF NEW.status <> address_change.calculate_request_status(NEW.request_id) THEN
      RAISE EXCEPTION 'Request status must match partner operations';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER request_guard BEFORE INSERT OR UPDATE ON address_change.address_change_request
  FOR EACH ROW EXECUTE FUNCTION address_change.guard_request();

CREATE FUNCTION address_change.sync_request_status() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE address_change.address_change_request
    SET status = address_change.calculate_request_status(NEW.request_id),
        updated_by = NEW.updated_by
    WHERE request_id = NEW.request_id;
  RETURN NEW;
END $$;
CREATE TRIGGER operation_status_sync AFTER INSERT OR UPDATE OF status
  ON address_change.processing_operation FOR EACH ROW
  EXECUTE FUNCTION address_change.sync_request_status();

-- Worker sets SENT only after confirmed successful upload, not partner application.
CREATE FUNCTION address_change.complete_sent_batch() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'SENT' AND OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM r.request_id FROM address_change.address_change_request r
      WHERE EXISTS (SELECT 1 FROM address_change.processing_operation o
        WHERE o.request_id = r.request_id AND o.batch_id = NEW.batch_id)
      ORDER BY r.request_id FOR UPDATE;
    UPDATE address_change.processing_operation
      SET status = 'SUCCEEDED', updated_by = NEW.updated_by
      WHERE batch_id = NEW.batch_id AND status NOT IN ('SUCCEEDED', 'CANCELLED');
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER batch_completion AFTER UPDATE OF status ON address_change.flat_file_batch
  FOR EACH ROW EXECUTE FUNCTION address_change.complete_sent_batch();

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
SELECT r.request_id, r.owner_sub, r.created_at, r.status,
  count(o.operation_id) AS operation_count,
  count(*) FILTER (WHERE o.status = 'SUCCEEDED') AS succeeded_count
FROM address_change.address_change_request r
LEFT JOIN address_change.processing_operation o USING (request_id)
GROUP BY r.request_id;

COMMENT ON TABLE address_change.status_type IS
  'Domain-specific status vocabulary; adding codes does not implement workflow behaviour.';
COMMENT ON COLUMN address_change.status_type.active IS
  'Administrative flag; application enforces new-use policy. FKs retain historical references.';
COMMENT ON COLUMN address_change.address_change_request.status IS
  'Stored summary maintained transactionally by partner-operation triggers.';
COMMENT ON COLUMN address_change.flat_file_batch.status IS
  'SENT is transport success, not proof of partner application.';
COMMENT ON COLUMN address_change.flat_file_batch.record_count IS
  'Detail records in the generated file, excluding header and trailer.';

INSERT INTO address_change.partner_system (partner_code, partner_name, delivery_mode)
VALUES ('ICBC', 'ICBC', 'FLAT_FILE'), ('HEALTH', 'Health / MSP', 'FLAT_FILE');

COMMENT ON COLUMN address_change.address_change_request.owner_sub IS
  'Exact subject from a validated token under the one-configured-issuer contract; never a token.';
COMMENT ON COLUMN address_change.address_change_request.raw_payload_encrypted IS
  'Application-encrypted UTF-8 JSON envelope including key version, nonce and authentication tag. No tokens or headers.';
COMMENT ON COLUMN address_change.processing_attempt.request_payload_encrypted IS
  'Application-encrypted exact outbound API body; no bearer tokens. Not evidence of partner receipt.';
COMMENT ON COLUMN address_change.processing_operation.batch_id IS
  'Single batch membership for MVP. Replacing this loses previous membership; use linking history before regeneration.';
COMMENT ON TABLE address_change.submitted_address IS
  'UTF-8 submitted values preserved verbatim. No transliteration or ASCII-only validation. Application keeps snapshots immutable.';
