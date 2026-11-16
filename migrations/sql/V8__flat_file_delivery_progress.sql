-- Per-step delivery tracking. A claim is a lease: a crashed worker leaves claimed_at set, and
-- another run may reclaim the step once the lease expires.
ALTER TABLE address_change.flat_file_batch
  ADD COLUMN sftp_attempt_count integer NOT NULL DEFAULT 0 CHECK (sftp_attempt_count >= 0),
  ADD COLUMN sftp_last_attempt_at timestamptz,
  ADD COLUMN sftp_last_error text,
  ADD COLUMN sftp_claimed_at timestamptz,
  ADD COLUMN s3_attempt_count integer NOT NULL DEFAULT 0 CHECK (s3_attempt_count >= 0),
  ADD COLUMN s3_last_attempt_at timestamptz,
  ADD COLUMN s3_last_error text,
  ADD COLUMN s3_claimed_at timestamptz;

COMMENT ON COLUMN address_change.flat_file_batch.sftp_claimed_at IS
  'Lease start of the worker running the SFTP step; NULL when no worker owns it.';
COMMENT ON COLUMN address_change.flat_file_batch.s3_claimed_at IS
  'Lease start of the worker running the S3 archive step; NULL when no worker owns it.';
COMMENT ON COLUMN address_change.flat_file_batch.sftp_last_error IS
  'Last SFTP failure code and message (no credentials); cleared on success.';
COMMENT ON COLUMN address_change.flat_file_batch.s3_last_error IS
  'Last S3 failure code and message (no credentials); cleared on success.';
