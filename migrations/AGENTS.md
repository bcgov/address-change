# Migrations (Flyway)

- Versioned SQL lives in `sql/` and starts empty; add application-specific migrations there. Never edit an applied migration; add a new version.
- Migrations target the `address_change` schema on PostgreSQL 18.
- Run locally with `docker compose run --rm migrations` (the database service must be up).
- Schema tests are in `tests/` and run by `.github/workflows/schema-tests.yml`.
