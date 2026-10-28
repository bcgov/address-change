-- Flat-file content and per-partner SFTP delivery settings.
ALTER TABLE address_change.flat_file_batch
  ADD COLUMN file_content bytea;

ALTER TABLE address_change.partner_system
  ADD COLUMN sftp_host text,
  ADD COLUMN sftp_port integer NOT NULL DEFAULT 22 CHECK (sftp_port BETWEEN 1 AND 65535),
  ADD COLUMN sftp_username text,
  ADD COLUMN sftp_auth_method text CHECK (sftp_auth_method IN ('PASSWORD', 'PRIVATE_KEY')),
  ADD COLUMN sftp_encrypted_password bytea CHECK (octet_length(sftp_encrypted_password) > 0),
  ADD COLUMN sftp_key_path text,
  ADD COLUMN sftp_remote_directory text,
  ADD CONSTRAINT partner_sftp_auth_check CHECK (
    sftp_auth_method IS NULL
    OR (sftp_auth_method = 'PASSWORD' AND sftp_encrypted_password IS NOT NULL)
    OR (sftp_auth_method = 'PRIVATE_KEY' AND sftp_key_path IS NOT NULL)
  );

COMMENT ON COLUMN address_change.flat_file_batch.file_content IS
  'Exact generated file bytes (UTF-8). Contains personal information; purge with the batch.';
COMMENT ON COLUMN address_change.partner_system.sftp_encrypted_password IS
  'Application-encrypted (AES-256-GCM) envelope; key comes from the SFTP_CREDENTIAL_ENCRYPTION_KEY OpenShift secret.';
COMMENT ON COLUMN address_change.partner_system.sftp_key_path IS
  'Path of a private key file mounted from an OpenShift secret; never the key itself.';
