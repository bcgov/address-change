#!/bin/sh
set -eu
if [ "${VAULT_DATABASE_ENABLED:-false}" = true ]; then
  credentials=/vault/secrets/db-migration.json
  # jq diagnostics can contain input text. Report a fixed error if parsing fails.
  if ! FLYWAY_USER=$(jq -er '.username | select(type == "string" and length > 0)' "$credentials" 2>/dev/null) ||
     ! FLYWAY_PASSWORD=$(jq -er '.password | select(type == "string" and length > 0)' "$credentials" 2>/dev/null); then
    echo 'Missing or invalid Vault migration credentials' >&2
    exit 1
  fi
  export FLYWAY_USER FLYWAY_PASSWORD
fi
: "${FLYWAY_USER:?Database migration username is required}"
: "${FLYWAY_PASSWORD:?Database migration password is required}"
exec /flyway/flyway "$@"
