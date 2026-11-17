# Migrations (Flyway)

- Versioned SQL lives in `sql/` and starts empty; add application-specific migrations there. Never edit an applied migration; add a new version.
- Migrations target the `address_change` schema on PostgreSQL 18.
- Run locally with `docker compose run --rm migrations` (the database service must be up).
- Schema tests are in `tests/` and run by `.github/workflows/schema-tests.yml`.
- Reporting views: `address_change_status` (submitted request/partner, latest API attempt) and `flat_file_status` (batch generation, SFTP delivery, S3 backup), defined in `sql/V10__status_reporting_views.sql`.
- Run both `tests/schema_smoke.sql` and `tests/status_views.sql` with `psql -X -v ON_ERROR_STOP=1` after migrations. Apply versioned files in numeric version order, not lexical order.
