# Backend (NestJS, Prisma)

- Run from `backend/`: `npm ci`, `npm run build`, `npm run lint`, `npm test`, `npm run test:cov`.
- Local debug uses `npm run start:dev` on port 3001 against the Compose `database` service (see `.vscode/launch.json`).
- Database schema is `address_change`; schema changes go in `migrations/sql/` (see `migrations/AGENTS.md`), not ad hoc.
- Generated Prisma output (`backend/generated/`) is ignored; do not commit it.
- Deployment template: `openshift.deploy.yml`.
- API endpoints are defined in the ts-rest contract, which also generates the OpenAPI spec; see the OpenAPI rule in [.agents/RULES.md](../.agents/RULES.md).
