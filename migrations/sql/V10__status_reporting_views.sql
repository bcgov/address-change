-- Operational reporting only: stored request/operation outcomes remain authoritative.
-- Request reporting includes submitted names, but no payloads, file bytes or credentials.
CREATE VIEW address_change.flat_file_status AS
SELECT
  b.batch_id,
  p.partner_name,
  b.file_date,
  b.file_name,
  b.status AS batch_status,
  b.record_count,
  b.checksum,
  b.first_request_received_at AS content_start_at,
  b.last_request_received_at AS content_end_at,
  b.created_at AS generation_started_at,
  b.generated_at,
  CASE
    WHEN b.generated_at IS NOT NULL THEN 'GENERATED'
    WHEN b.status = 'FAILED' THEN 'FAILED'
    WHEN b.status = 'UNKNOWN' THEN 'UNKNOWN'
    ELSE 'IN_PROGRESS'
  END AS generation_status,
  b.transferred_at AS delivered_at,
  CASE
    WHEN b.transferred_at IS NOT NULL THEN 'SENT'
    WHEN b.sftp_claimed_at IS NOT NULL THEN 'IN_PROGRESS'
    WHEN b.sftp_last_error IS NOT NULL THEN 'FAILED'
    WHEN b.generated_at IS NULL THEN 'NOT_READY'
    WHEN b.status = 'UNKNOWN' THEN 'UNKNOWN'
    ELSE 'PENDING'
  END AS delivery_status,
  b.sftp_attempt_count AS delivery_attempt_count,
  b.sftp_last_attempt_at AS delivery_last_attempt_at,
  b.sftp_last_error AS delivery_last_error,
  b.sftp_claimed_at AS delivery_claimed_at,
  b.s3_backed_up_at,
  CASE
    WHEN b.s3_backed_up_at IS NOT NULL THEN 'BACKED_UP'
    WHEN b.s3_claimed_at IS NOT NULL THEN 'IN_PROGRESS'
    WHEN b.s3_last_error IS NOT NULL THEN 'FAILED'
    WHEN b.transferred_at IS NULL THEN 'NOT_READY'
    ELSE 'NOT_STARTED'
  END AS s3_backup_status,
  b.s3_attempt_count,
  b.s3_last_attempt_at,
  b.s3_last_error,
  b.s3_claimed_at,
  b.s3_object_key,
  b.updated_at
FROM address_change.flat_file_batch b
JOIN address_change.partner_system p ON p.partner_id = b.partner_id;

COMMENT ON VIEW address_change.flat_file_status IS
  'One row per batch. Generation, SFTP delivery and S3 archival are independent; SENT proves transport, not partner application. No file content or resident details.';
COMMENT ON COLUMN address_change.flat_file_status.content_start_at IS
  'Earliest request received_at captured when batch membership was frozen; not a scheduled cutoff. NULL for batches without a recorded window.';
COMMENT ON COLUMN address_change.flat_file_status.content_end_at IS
  'Latest request received_at captured when batch membership was frozen; retained independently of request purging.';
COMMENT ON COLUMN address_change.flat_file_status.generation_status IS
  'generated_at proves generation, even after delivery failures. READY without generated_at is still IN_PROGRESS while file bytes are being built.';
COMMENT ON COLUMN address_change.flat_file_status.delivery_status IS
  'Completion timestamp takes precedence over claims and errors; a claim takes precedence over an earlier failure during retry. Claims may be expired; this view does not evaluate worker leases.';
COMMENT ON COLUMN address_change.flat_file_status.s3_backup_status IS
  'BACKED_UP, IN_PROGRESS, FAILED, NOT_READY (delivery incomplete), or NOT_STARTED. S3 enablement is runtime configuration, not persisted; NOT_STARTED cannot distinguish disabled archival from pending archival.';

CREATE VIEW address_change.address_change_status AS
SELECT
  r.request_id,
  person.first_name,
  person.last_name,
  r.received_at,
  r.effective_date,
  r.status AS request_status,
  r.updated_at AS request_updated_at,
  o.operation_id,
  o.delivery_mode,
  CASE WHEN o.delivery_mode = 'FLAT_FILE' THEN p.partner_name END AS flat_file_partner_name,
  CASE WHEN o.delivery_mode = 'FLAT_FILE' THEN o.status END AS flat_file_partner_sync_status,
  CASE WHEN o.delivery_mode = 'FLAT_FILE' THEN o.updated_at END AS flat_file_partner_sync_updated_at,
  CASE WHEN o.delivery_mode = 'REALTIME' THEN p.partner_name END AS api_partner_name,
  CASE WHEN o.delivery_mode = 'REALTIME' THEN o.status END AS api_partner_sync_status,
  CASE WHEN o.delivery_mode = 'REALTIME' THEN o.updated_at END AS api_partner_sync_updated_at,
  a.attempt_id AS api_attempt_id,
  a.attempt_number AS api_attempt_number,
  a.status AS api_attempt_status,
  a.started_at AS api_attempt_started_at,
  a.completed_at AS api_attempt_completed_at,
  a.error_code AS api_error_code,
  f.batch_id AS flat_file_batch_id,
  f.file_name AS flat_file_name,
  f.generation_status AS flat_file_generation_status,
  f.generated_at AS flat_file_generated_at,
  f.delivery_status AS flat_file_delivery_status,
  f.delivered_at AS flat_file_delivered_at,
  f.s3_backup_status AS flat_file_s3_backup_status,
  f.s3_backed_up_at AS flat_file_s3_backed_up_at
FROM address_change.address_change_request r
LEFT JOIN address_change.request_person person ON person.request_id = r.request_id
LEFT JOIN address_change.processing_operation o ON o.request_id = r.request_id
LEFT JOIN address_change.partner_system p ON p.partner_id = o.partner_id
LEFT JOIN address_change.flat_file_status f
  ON f.batch_id = o.batch_id
  AND o.delivery_mode = 'FLAT_FILE'
LEFT JOIN LATERAL (
  SELECT attempt_id, attempt_number, status, started_at, completed_at, error_code
  FROM address_change.processing_attempt
  WHERE operation_id = o.operation_id AND o.delivery_mode = 'REALTIME'
  ORDER BY attempt_number DESC
  LIMIT 1
) a ON true
WHERE r.status <> 'DRAFT';

COMMENT ON VIEW address_change.address_change_status IS
  'One row per submitted request/selected partner, including submitted first/last names (personal information). Requests without operations or person snapshots remain visible. DRAFTs excluded. Stored outcomes are not recomputed. Flat-file and API partner columns are populated only for their respective delivery mode; API columns do not imply an implemented API integration. No encrypted payloads.';
COMMENT ON COLUMN address_change.address_change_status.delivery_mode IS
  'Delivery mode recorded on the operation, not the current partner configuration: FLAT_FILE or REALTIME (API).';
COMMENT ON COLUMN address_change.address_change_status.api_attempt_status IS
  'Latest API attempt by attempt_number, including an in-flight retry. NULL before any attempt or for flat-file operations; api_partner_sync_status is the authoritative API operation outcome.';
COMMENT ON COLUMN address_change.address_change_status.flat_file_delivery_status IS
  'NULL for API operations or a flat-file operation not yet assigned to a batch; flat_file_partner_sync_status still reports its stored outcome. SENT proves transport, not partner application.';