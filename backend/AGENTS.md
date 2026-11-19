# Backend (NestJS, Prisma)

- Run from `backend/`: `npm ci`, `npm run build`, `npm run lint`, `npm test`, `npm run test:cov`.
- Local debug uses `npm run start:dev` on port 3001 against the Compose `database` service (see `.vscode/launch.json`).
- Database schema is `address_change`; schema changes go in `migrations/sql/` (see `migrations/AGENTS.md`), not ad hoc.
- Generated Prisma output (`backend/generated/`) is ignored; do not commit it.
- Deployment template: `openshift.deploy.yml`.
- Retention purge (`src/retention/`, `npm run data:purge`, CronJob `*-data-purge`): DB uses `DATA_RETENTION_DAYS` (default 30, minimum 7; batches from the last 7 days are kept). Independently scans the entire `FLAT_FILE_S3_BUCKET` for objects older than `S3_RETENTION_DAYS` (default 60, positive integer), using S3 LastModified; overwrites restart age. `DATA_PURGE_S3_FLAT_FILES=false` disables S3 cleanup. Use a dedicated bucket; DB batch rows are not needed for S3 expiry.
- API endpoints are defined in the ts-rest contract, which also generates the OpenAPI spec; see the OpenAPI rule in [.agents/RULES.md](../.agents/RULES.md).
