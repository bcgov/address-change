#!/bin/sh
set -eu
if [ "${VAULT_DATABASE_ENABLED:-false}" = true ]; then
  credentials=/vault/migration/db-migration.json
  # A sentinel prevents command substitution from trimming credential newlines.
  # jq diagnostics can contain input text, so report a fixed error on failure.
  if ! FLYWAY_USER=$(jq -ej '.username | select(type == "string" and length > 0)' "$credentials" 2>/dev/null && printf '.') ||
     ! FLYWAY_PASSWORD=$(jq -ej '.password | select(type == "string" and length > 0)' "$credentials" 2>/dev/null && printf '.'); then
    echo 'Missing or invalid Vault migration credentials' >&2
    exit 1
  fi
  FLYWAY_USER=${FLYWAY_USER%.}
  FLYWAY_PASSWORD=${FLYWAY_PASSWORD%.}
  export FLYWAY_USER FLYWAY_PASSWORD
fi
: "${FLYWAY_USER:?Database migration username is required}"
: "${FLYWAY_PASSWORD:?Database migration password is required}"
exec /flyway/flyway "$@"
