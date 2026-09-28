---
name: start-restart
description: Start or restart the local Address Change API with the Docker Compose lifecycle helper, verify health, and report logs.
---

# Start/Restart

Locate the actual checkout and read `.agents/rules/local-lifecycle/RULE.md`. Use Docker Compose through `tools/app.py`; do not start a host Java process or duplicate the helper's lifecycle logic.

Run `python tools/app.py start` or `python tools/app.py restart` from the checkout root. Use `python3` where appropriate. On Linux/macOS/WSL, `bash tools/app.sh start` is a convenience entry point to the same helper. On Windows use native Python if Docker is available there, or the actual checkout in WSL if Docker is available there. Never assume a fixed path or install tools automatically.

The helper checks Docker/Compose, validates configuration, builds, waits for container readiness, and checks the published HTTP health endpoint. It uses the ignored `.env` through Compose, with shell variables taking precedence. Do not overwrite `.env` or print its contents. The default startup timeout is 180 seconds; use `--timeout 300` when first-time downloads demonstrably need longer.

Follow running command sessions to completion. A nonzero exit means failure; inspect the helper's error and container logs without claiming success from a container ID alone. Avoid repeating unchanged commands. Report the URL and health result on success, and `python tools/app.py logs` for logs.

Use `status`, `logs`, `test`, and `stop` through the same helper when requested. Stop preserves named volumes. Do not stop unrelated services or remove volumes without authorization. If prerequisites are missing, recommend Initialize Project and explain the specific missing prerequisite.
