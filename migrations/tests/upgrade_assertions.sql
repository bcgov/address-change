-- Run only against the disposable database populated by v1_upgrade_fixture.sql.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM address_change.address_change_request
    WHERE owner_sub = 'upgrade-fixture-owner' AND status = 'COMPLETED'
      AND created_by = 'fixture-actor') THEN
    RAISE EXCEPTION 'Upgrade did not preserve audit actor / backfill completion';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM address_change.processing_operation o
    JOIN address_change.address_change_request r USING (request_id)
    WHERE r.owner_sub = 'upgrade-fixture-owner' AND o.status = 'SUCCEEDED') THEN
    RAISE EXCEPTION 'Legacy sent operation not completed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM address_change.flat_file_batch
    WHERE file_name = 'synthetic-fixture.txt' AND status = 'SENT' AND record_count = 1) THEN
    RAISE EXCEPTION 'Legacy batch not converted';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'address_change' AND column_name IN
      ('closed_at', 'sftp_status', 'sftp_status_category', 'acknowledged_at')) THEN
    RAISE EXCEPTION 'Superseded lifecycle columns still exist';
  END IF;
  IF (SELECT count(*) FROM information_schema.triggers
    WHERE trigger_schema = 'address_change' AND trigger_name = 'z_set_updated_at') <> 8 THEN
    RAISE EXCEPTION 'Missing shared audit trigger';
  END IF;
  RAISE NOTICE 'Populated V1 upgrade checks passed';
END $$;
