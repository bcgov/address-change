#!/bin/bash
set -euo pipefail
umask 077
# oc exec starts a new process, so manual operations load the injected values too.
if [[ "${VAULT_ENABLED:-false}" == true ]]; then
  for credentials in /vault/secrets/env-*.sh; do
    . "$credentials"
  done
fi
cd /
work=$(mktemp -d /backups/operation.XXXXXXXX)
trap 'rm -rf -- "$work"' EXIT
export AWS_CONFIG_FILE="$work/aws-config"
export AWS_EC2_METADATA_DISABLED=true
export AWS_REQUEST_CHECKSUM_CALCULATION=when_required
export AWS_RESPONSE_CHECKSUM_VALIDATION=when_required
printf '[default]\ns3 =\n    addressing_style = path\n' > "$AWS_CONFIG_FILE"
s3() {
  /s3-client/aws --endpoint-url "$ARCHIVE_ENDPOINT" --no-cli-pager s3 "$@"
}
remote="s3://$ARCHIVE_BUCKET/$ARCHIVE_PREFIX"

latest_archive() {
  # The uploader prefixes filenames with a sortable UTC timestamp.
  local object
  object=$(s3 ls "$remote/" | awk '$NF ~ /^[0-9].*\.sql\.gz$/ && $1 != "PRE" {print $NF}' | LC_ALL=C sort | tail -1) || return
  if [[ -z "$object" ]]; then
    echo "No timestamped backup archives found under $remote/" >&2
    return 1
  fi
  printf '%s\n' "$object"
}

case "${1:-}" in
  backup)
    export PGUSER="$DATABASE_USER" PGPASSWORD="$DATABASE_PASSWORD"
    archive="$work/$(date -u +%Y-%m-%dT%H-%M-%S)-$(basename "$work").sql.gz"
    pg_dumpall --roles-only --no-role-passwords |
      awk -v user="$PGUSER" '
        { role=$3; gsub(/[";]/, "", role) }
        !(($1 == "CREATE" || $1 == "ALTER") && $2 == "ROLE" && (role == user || role == "postgres"))
      ' | gzip > "$archive"
    pg_dump --format=plain --schema=address_change --strict-names | gzip >> "$archive"
    s3 cp "$archive" "$remote/${archive##*/}"
    echo "Uploaded ${archive##*/}"
    ;;
  verify)
    object=$(latest_archive)
    s3 cp "$remote/$object" "$work/$object"
    gzip -t "$work/$object"
    # Upstream verification uses the backup-role credentials for its local instance.
    # Its wrapper can report success without verifying a file, so require the success log.
    unset PGHOST PGPORT PGDATABASE
    export ROOT_BACKUP_DIR="$work/" PGSSLMODE=prefer
    /bin/bash /backup.sh -s -v all -f "$object" | tee "$work/verify.log"
    grep -Fq 'Successfully verified backup:' "$work/verify.log"
    ;;
  restore)
    export PGPASSWORD="$RECOVERY_PASSWORD"
    object="$RECOVERY_OBJECT"
    if [[ -z "$object" ]]; then
      object=$(latest_archive)
    fi
    echo "Selected archive: $remote/$object"
    s3 cp "$remote/$object" "$work/backup.sql.gz"
    # Older archives append a separate pg_dumpall section after the database dump.
    gzip -dc "$work/backup.sql.gz" | awk '
      !started && $0 == "-- PostgreSQL database dump" { started=1 }
      !started || finished { next }
      in_copy {
        print
        if ($0 == "\\.") in_copy=0
        next
      }
      $0 == "-- PostgreSQL database cluster dump" { finished=1; next }
      /^COPY .* FROM stdin;$/ { in_copy=1 }
      { print }
      END { if (!started) exit 1 }
    ' > "$work/database.sql"
    psql -X -d postgres -v ON_ERROR_STOP=1 -v target="$RECOVERY_DATABASE" \
      -v owner="$MIGRATION_ROLE" -v runtime="$RUNTIME_ROLE" <<'SQL'
SELECT count(*) = 2 AS roles_ready FROM pg_roles
WHERE rolname IN (:'runtime', :'owner') AND rolcanlogin \gset
\if :roles_ready
SELECT format('CREATE DATABASE %I OWNER %I', :'target', :'owner') \gexec
\else
DO $$ BEGIN RAISE EXCEPTION 'Bootstrap migration and runtime roles must already exist'; END $$;
\endif
SQL
    psql -X -d "$RECOVERY_DATABASE" --single-transaction -v ON_ERROR_STOP=1 -v VERBOSITY=sqlstate -v SHOW_CONTEXT=never \
      -v database_name="$RECOVERY_DATABASE" -v schema_name=address_change \
      -v migration_user="$MIGRATION_ROLE" -v runtime_user="$RUNTIME_ROLE" \
      -f "$work/database.sql" -f /ac-backup/recovery-grants.sql > "$work/restore.log" 2>&1 ||
      {
        # Report only SQLSTATE and the script line. Error details can contain row data.
        grep -E '^psql:.*:[0-9]+: ERROR:  [0-9A-Z]{5}$' "$work/restore.log" >&2 || true
        echo 'Restore failed. The new database was created, and the restore transaction failed.' >&2
        exit 1
      }
    echo "Restored $object into $RECOVERY_DATABASE"
    ;;
  *) echo 'Usage: s3-operations.sh backup|verify|restore' >&2; exit 2 ;;
esac
