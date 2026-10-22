# AGENTS.md

Repository facts for automated coding assistants. Keep every `AGENTS.md` at or under 100 lines; put directory-specific detail in that directory's own `AGENTS.md`.

## Navigation
- Use [.agents/INDEX.md](.agents/INDEX.md) to find where to read or edit when the location isn't obvious. Keep it to key entry points; update it only when one is added, moved, or removed.
- Scan [.agents/RULES.md](.agents/RULES.md); read a rule only when its description fits the task.
- Read the nearest directory `AGENTS.md` before changing files there: [backend](backend/AGENTS.md), [frontend](frontend/AGENTS.md), [migrations](migrations/AGENTS.md), [common](common/AGENTS.md), [.github](.github/AGENTS.md).
- Skills live in `.agents/skills/`. Use `start-restart` to run the app locally; `github-actions` and `openshift-deployment` are installed through APM (`apm.yml`, `apm.lock.yaml`) and must not be hand-edited.

## Stack
- `backend/` (NestJS, Prisma), `frontend/` (Vite, React, Caddy), `migrations/` (Flyway SQL), `common/` (OpenShift templates, tests), `scripts/` (setup)
- PostgreSQL major version is 18 across local development, PR previews, CI, and Patroni TEST/PROD. Official PostgreSQL clients/images are pinned to 18.6; Spilo/backup patch levels must be verified independently.
- TEST/PROD consume Patroni provisioned in the same namespace by `loc-tools`; PRs retain disposable databases.
- Deploys to OpenShift run from GitHub Actions (PR open, merge), not from a workstation.
- Full stack locally: `docker compose up` (optional profiles: `schemaspy`, `caddy`)

## Delegation
- Give sub-agents a bounded task, relevant paths, constraints, and the expected evidence or deliverable. Do not delegate when coordination costs more than doing the work.
- Routine work (running start-restart, simple checks, small documentation edits) suits a lighter model; keep design decisions and ambiguous failures with the primary agent.

## Guardrails
- Do NOT read `.env` files; read only `.env.example` (if present) and tell the user what to update.
- Do NOT update `README.md` without approval.
- Write commit messages per [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/) (`type(scope): description`; `!` or a `BREAKING CHANGE:` footer for breaking changes). Commit only when asked.
- Run the relevant build, lint, and test commands from the directory's `AGENTS.md` after changes, and report anything not run.
