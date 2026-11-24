-- Pinned SSH host key fingerprints, comma-separated (e.g. "SHA256:abc...,SHA256:def..." to allow key rotation).
ALTER TABLE address_change.partner_system
  ADD COLUMN sftp_host_key_fingerprints text;

ALTER TABLE address_change.partner_system
  ADD CONSTRAINT partner_sftp_host_key_fingerprints_check
  CHECK (
    sftp_host_key_fingerprints IS NULL
    OR sftp_host_key_fingerprints ~ '^SHA256:[A-Za-z0-9+/]{43}(,SHA256:[A-Za-z0-9+/]{43})*$'
  );
