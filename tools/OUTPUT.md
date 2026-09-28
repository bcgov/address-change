# Lifecycle command output

All `tools/app.py` actions default to a short result and a unique log path under ignored `.run/logs/`. Build and container command output is saved there rather than printed on success. Failures and the `logs` action include a diagnostic excerpt capped at 20 lines and 4,000 characters. Logs remain local and may contain application data; do not commit or automatically share them.

```sh
python tools/app.py status --json
python tools/app.py test --verbose
python tools/app.py test --json --verbose
```

`--json` produces exactly one JSON object on stdout for completed commands and argument errors. `--help` remains ordinary CLI help. `--verbose` prints the full saved log after command completion; with `--json`, verbose output goes to stderr. Resolved Compose configuration is used internally and is not copied into command logs.

## Result schema (version 1)

| Field | Meaning |
| --- | --- |
| `schema_version` | Result contract version, currently 1. |
| `action` | Requested action, or null if argument parsing failed. |
| `success` | Whether the command completed successfully. |
| `message` | Short human-readable result or failure description. |
| `error_code` | Stable failure category, null on success. |
| `health_url` | Verified health endpoint for start/restart/status, otherwise null. |
| `log_path` | Absolute path to this invocation's log, or null if no log could be created. |
| `diagnostics` | Bounded log excerpt on failure or the logs action; empty otherwise. |

Exit codes: 0 success, 1 execution/check failure, 2 invalid arguments. Agents should check the exit code and `success`, then inspect `error_code` and `diagnostics`; read the full log only when needed. A successful `check` does not establish API health.

Failure categories include `INVALID_ARGUMENT`, `PYTHON_VERSION_UNSUPPORTED`, `DOCKER_NOT_FOUND`, `COMPOSE_UNAVAILABLE`, `COMPOSE_VERSION_UNKNOWN`, `COMPOSE_VERSION_UNSUPPORTED`, `DOCKER_UNAVAILABLE`, `INVALID_CONFIG`, `INVALID_PORT`, `PORT_UNAVAILABLE`, and `API_UNHEALTHY`. Unclassified command failures use `COMMAND_FAILED`; other check or I/O failures use `CHECK_FAILED`.
