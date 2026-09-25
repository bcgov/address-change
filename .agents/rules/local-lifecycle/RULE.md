# Local application lifecycle

Use Docker Compose through `python tools/app.py` (or `python3`). The Start/Restart skill invokes this helper and interprets results; keep prerequisite checks, startup, restart, health polling, logs, and failures in the script. `tools/app.sh` only forwards to Python.

Use ignored `.env` for the local port. Never assume machine-specific paths or require host Java/Maven for development. The Maven Wrapper supplies the pinned Maven version inside the container. Do not start a host Java process as a fallback.

Require successful container readiness and HTTP status UP before reporting startup success. On failure inspect the helper output and logs. Stop only this Compose project and preserve named volumes unless removal is requested.

For agent calls, prefer `--json` and interpret the exit code plus `success`. Consult `tools/OUTPUT.md` for the schema and error categories. Read `diagnostics` before the full log. Default output is concise; `--verbose` prints the complete log after completion (stderr when combined with `--json`). Never claim API health from a successful prerequisite check.
