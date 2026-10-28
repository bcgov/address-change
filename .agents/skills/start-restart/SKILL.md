---
name: start-restart
description: Start or restart the local Address Change stack using the current user's preferred method (Docker Compose or the VS Code "Debug full stack" launch), remember that preference, and verify the services respond.
---

# Start/Restart

Run from the repository root. Never read `.env` files and never install tools automatically.

## Choose the method

1. Read `.agents/local/preferences.json` (ignored by git, per user), e.g. `{"startMethod": "docker"}` or `{"startMethod": "launch"}`.
2. If it is missing, or the user asks to change it, ask which they use and save it:
   - `docker`: everything in containers with Docker Compose.
   - `launch`: database and migrations in Docker, backend and frontend as local Node 22 processes from `.vscode/launch.json` ("Debug full stack").
3. If the user states a preference in the request ("use docker this time"), follow it. Update the file only when they want it remembered.
4. If the preferred tooling is unavailable (Docker not running, Node 22 missing), report that and offer the other method; do not switch silently.

## Docker

- Start: `docker compose up --build --detach`; restart: `docker compose down` then the start command. Add `--profile caddy` or `--profile schemaspy` only when asked.
- Stop with `docker compose down`. Do not remove volumes unless the user asks.
- Logs: `docker compose logs --tail 100 <service>`.

## Launch

- Before first launch and after schema changes, explicitly run the "Prepare local database" task: `docker compose up --detach database`, then `docker compose run --rm migrations`. "Debug full stack" does not run this task automatically.
- For normal debugger restarts, reuse the running database and do not rerun migrations. If the database is stopped, run "Start local database" first.
- Start backend (`npm run start:dev` in `backend/`, port 3001) and frontend (`npm run dev` in `frontend/`, port 3000) with the `env` values in `.vscode/launch.json`, as long-running background processes. Debugger attachment is a VS Code action; tell the user to press F5 on "Debug full stack" if they want breakpoints.
- Restart: stop only the processes you started, then start them again.

## Verify

- Confirm `docker compose ps` shows the database healthy (and the other services running for `docker`).
- Check the backend and frontend ports respond (3001 and 3000 for `launch`; use the published ports in `docker-compose.yml` for `docker`).
- Do not report success from a started process alone. On failure, read the service logs and report the cause.
