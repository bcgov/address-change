-- Upload to "<name>.part" and rename when complete; the final name then only ever holds a whole file.
-- With it on, the transfer also refuses to resend when the final file already exists.
ALTER TABLE address_change.partner_system
  ADD COLUMN sftp_use_temp_file boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN address_change.partner_system.sftp_use_temp_file IS
  'Upload as <name>.part then rename; skips the send if the final file already exists. When false, upload directly and overwrite.';
