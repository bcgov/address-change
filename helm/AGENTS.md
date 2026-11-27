# Database Helm charts

- Operational entry point: `OPERATIONS.md`. Recovery runbook: `charts/address-change-db-backup/RECOVERY.md`.
- TEST/PROD only in the database workflow; DEV/PR databases remain disposable and use `common/` templates.
- Preserve Helm release names, resource names, Vault paths, and database roles when relocating code.
- Charts: `patroni`, `address-change-db-bootstrap`, `address-change-db-backup`, and the shared `address-change-db-permissions` library.
- Use the `openshift-deployment` skill for workload changes and `github-actions` for workflow changes.
- Build chart dependencies before rendering or running tests; generated `charts/` dependencies are ignored.
- Run the three Python test suites listed in `OPERATIONS.md`, Helm lint on the affected charts, and Bash syntax checks on changed scripts.
- Never print rendered legacy-mode Secrets or real credential values in test output.
- Runtime credentials come from Vault in workflow deployments. No cluster operations are required for local chart checks.
