-- Preserve V1's Flyway checksum; implement the reviewed model in V2.
CREATE TABLE address_change.status_type (
  status_category text NOT NULL,
  status_code text NOT NULL,
  display_name text NOT NULL,
  description text,
  active boolean NOT NULL DEFAULT true,
  PRIMARY KEY (status_category, status_code)
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

DROP TRIGGER operation_completion ON address_change.processing_operation;
DROP TRIGGER operation_guard ON address_change.processing_operation;
DROP TRIGGER request_guard ON address_change.address_change_request;
DROP FUNCTION address_change.close_finished_request();
DROP VIEW address_change.request_status;

-- Convert previous transport states before removing the separate SFTP fields.
ALTER TABLE address_change.flat_file_batch DROP CONSTRAINT flat_file_batch_status_check;
UPDATE address_change.flat_file_batch SET status = CASE
  WHEN status IN ('SENT', 'ACKNOWLEDGED') OR sftp_status = 'SUCCEEDED' THEN 'SENT'
  WHEN sftp_status = 'IN_PROGRESS' THEN 'UNKNOWN'
  WHEN sftp_status IN ('FAILED', 'UNKNOWN') THEN sftp_status
  ELSE status END;
UPDATE address_change.processing_operation o SET status = 'SUCCEEDED'
WHERE o.status NOT IN ('SUCCEEDED', 'CANCELLED') AND o.delivery_mode = 'FLAT_FILE'
  AND (o.status = 'SENT' OR EXISTS (
    SELECT 1 FROM address_change.flat_file_batch b
    WHERE b.batch_id = o.batch_id AND b.status = 'SENT'));
ALTER TABLE address_change.flat_file_batch
  DROP COLUMN sftp_status,
  DROP COLUMN acknowledged_at,
  ADD COLUMN status_category text GENERATED ALWAYS AS ('BATCH'::text) STORED,
  ADD CONSTRAINT batch_status_fk FOREIGN KEY (status_category, status)
    REFERENCES address_change.status_type (status_category, status_code);
ALTER TABLE address_change.processing_operation
  DROP CONSTRAINT processing_operation_status_check,
  ADD COLUMN status_category text GENERATED ALWAYS AS ('OPERATION'::text) STORED,
  ADD CONSTRAINT operation_status_fk FOREIGN KEY (status_category, status)
    REFERENCES address_change.status_type (status_category, status_code);
ALTER TABLE address_change.processing_attempt
  DROP CONSTRAINT processing_attempt_status_check,
  ADD COLUMN status_category text GENERATED ALWAYS AS ('ATTEMPT'::text) STORED,
  ADD CONSTRAINT attempt_status_fk FOREIGN KEY (status_category, status)
    REFERENCES address_change.status_type (status_category, status_code);

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
ALTER TABLE address_change.address_change_request
  ADD COLUMN status text NOT NULL DEFAULT 'SUBMITTED',
  ADD COLUMN status_category text GENERATED ALWAYS AS ('REQUEST'::text) STORED,
  ADD CONSTRAINT request_status_fk FOREIGN KEY (status_category, status)
    REFERENCES address_change.status_type (status_category, status_code);
UPDATE address_change.address_change_request
  SET status = address_change.calculate_request_status(request_id);
DROP INDEX address_change.one_active_request_per_owner;
ALTER TABLE address_change.address_change_request DROP COLUMN closed_at;
CREATE UNIQUE INDEX one_active_request_per_owner
  ON address_change.address_change_request(owner_sub)
  WHERE status NOT IN ('COMPLETED', 'CLOSED');

-- Existing audit values are preserved. For historical rows missing audit fields,
-- new fields contain migration time/role, not invented historical actor details.
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['status_type', 'partner_system',
    'address_change_request', 'submitted_address', 'request_person',
    'flat_file_batch', 'processing_operation', 'processing_attempt'] LOOP
    EXECUTE format('ALTER TABLE address_change.%I
      ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
      ADD COLUMN IF NOT EXISTS created_by text NOT NULL DEFAULT current_user,
      ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
      ADD COLUMN IF NOT EXISTS updated_by text NOT NULL DEFAULT current_user', table_name);
  END LOOP;
END $$;
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

CREATE OR REPLACE FUNCTION address_change.guard_operation() RETURNS trigger LANGUAGE plpgsql AS $$
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

CREATE OR REPLACE FUNCTION address_change.guard_request() RETURNS trigger LANGUAGE plpgsql AS $$
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
