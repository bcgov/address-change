{{- define "address-change-db-permissions.grants" -}}
SELECT format(
  'GRANT CONNECT ON DATABASE %I TO %I', :'database_name', :'runtime_user'
) \gexec
SELECT format(
  'GRANT USAGE ON SCHEMA %I TO %I', :'schema_name', :'runtime_user'
) \gexec
SELECT format(
  'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA %I TO %I',
  :'schema_name', :'runtime_user'
) \gexec
SELECT format(
  'GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA %I TO %I',
  :'schema_name', :'runtime_user'
) \gexec
SELECT format(
  'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA %I GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO %I',
  :'migration_user', :'schema_name', :'runtime_user'
) \gexec
SELECT format(
  'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA %I GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO %I',
  :'migration_user', :'schema_name', :'runtime_user'
) \gexec
SELECT format(
  'ALTER ROLE %I IN DATABASE %I SET search_path TO %I, public',
  :'migration_user', :'database_name', :'schema_name'
) \gexec
SELECT format(
  'ALTER ROLE %I IN DATABASE %I SET search_path TO %I, public',
  :'runtime_user', :'database_name', :'schema_name'
) \gexec
{{- end -}}
