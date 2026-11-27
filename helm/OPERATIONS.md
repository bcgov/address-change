# Address Change database operations

This repository owns the TEST/PROD database charts and the manually triggered
**Address Change database operations** workflow. DEV/PR previews continue to use
the disposable PostgreSQL templates in `common/`.

| Component | Source | Helm release |
| --- | --- | --- |
| Patroni PostgreSQL cluster | `helm/charts/patroni` | `address-change-db` |
| Database, schema, roles, and grants | `helm/charts/address-change-db-bootstrap` | `address-change-db-bootstrap` |
| S3 backups, verification, and recovery | `helm/charts/address-change-db-backup` | `address-change-db-backup` |
| Shared grants and Vault templates | `helm/charts/address-change-db-permissions` | Library only |

## Repository handover

The charts, tests, runbooks, `.github/scripts/address-change-database.sh`, and
`.github/workflows/address-change-database.yml` were imported from
`bcgov-c/loc-tools` main at commit
`a7ade9ee8106f0fc7796de0d3656f6396e67a266`.
The vendored Patroni chart retains its upstream provenance and licence.

**Moving these files does not require reinstalling the database.** Release names,
resource names, namespaces, Vault paths, S3 prefixes, and local chart dependency
paths remain unchanged. Existing releases can be managed from this repository.
Do not uninstall releases or delete PVCs as part of the handover.

1. Configure the settings below in the `address-change` GitHub repository and
   its existing `test` and `prod` environments. Settings do not transfer with files.
2. Merge this repository's migration so the manually triggered workflow is
   available on its default branch.
3. Retire the old workflow in `loc-tools` and let any in-flight database runs
   finish before starting operations here. Concurrency groups do not coordinate
   between repositories; never operate both workflows concurrently.
4. Run the next required database operation from `address-change`, then verify
   its rollout and backup/verification results. Existing installations do not
   need `provision-patroni` or `bootstrap` solely because the repository changed.

The paired `loc-tools` change removes its chart and workflow sources and leaves
a link here. Merge that removal after the destination is ready.

## GitHub settings

Use **Settings → Secrets and variables → Actions**, including environment settings.

| Setting | Type | Scope and purpose |
| --- | --- | --- |
| `OC_TOKEN` | Secret | Existing repository or environment deployment credential; must have database operations permissions in the target namespace |
| `OC_SERVER` | Variable | Repository default is suitable when both environments use the same Gold API |
| `OC_NAMESPACE` | Variable | Environment-specific: `b5cfc6-test` or `b5cfc6-prod` |
| `S3_ENDPOINT` | Variable | Repository default is suitable for a shared endpoint |
| `S3_BUCKET` | Variable | Environment-specific backup destination |
| `S3_PREFIX` | Optional variable | Defaults to `address_change_db_backups`; preserve any existing override |
| `S3_REGION` | Optional variable | Defaults to `us-east-1`; preserve any existing override |
| `VAULT_S3_PATH` | Optional variable | Full KV v2 API path if backups use a separate S3 identity; otherwise defaults to the application's environment S3 entry |

Retain the environment's existing reviewers and deployment branch restrictions.
Confirm `OC_TOKEN` has the permissions previously used by the `loc-tools`
workflow, including Helm release management, workload/RBAC management, and Job
log access. Do not assume that a token suitable only for application deployments
has those permissions. Do not copy runtime credentials into GitHub.

## Operations

Open **Actions → Address Change database operations → Run workflow** and choose
TEST or PROD. Review the selected branch and environment before starting.

| Operation | When to use |
| --- | --- |
| `provision-patroni` | Install a new cluster; fails when the release already exists |
| `configure-patroni` | Upgrade an existing cluster's configuration, including its Vault startup |
| `bootstrap` | Create/reconcile the application database, schema, and roles |
| `deploy-backup` | Install/upgrade the S3 backup deployment and reconcile the backup role |
| `recover` | Restore an archive into an unused database name; blank archive selects the latest |

For a new environment: prepare Vault credentials, run `provision-patroni`, then
`bootstrap`, redeploy the application to run Flyway, and run `deploy-backup`.
Create a new backup after Flyway has created the tables, then verify that archive.

For existing installations, preserve credentials and reviewed Helm settings.
Follow the [Vault migration guide](charts/address-change-db-permissions/VAULT.md)
when changing credential sources. Use the
[backup guide](charts/address-change-db-backup/README.md) for manual backup and
verification commands and the
[recovery runbook](charts/address-change-db-backup/RECOVERY.md) for restore drills.

## Local checks

From the repository root, with Helm, Bash, Python, and PyYAML installed:

```sh
helm repo add bcgov https://bcgov.github.io/helm-charts
helm dependency build helm/charts/patroni
helm dependency build helm/charts/address-change-db-bootstrap
helm dependency build helm/charts/address-change-db-backup

helm lint helm/charts/patroni
helm lint helm/charts/address-change-db-bootstrap
helm lint helm/charts/address-change-db-backup

python3 helm/charts/patroni/tests/test_chart.py
python3 helm/charts/address-change-db-backup/tests/test_chart.py
python3 helm/charts/address-change-db-permissions/tests/test_vault.py

bash -n .github/scripts/address-change-database.sh
bash -n helm/charts/address-change-db-backup/files/s3-operations.sh
```

These checks do not connect to OpenShift or Vault. Live policies, permissions,
quota, image pulls, and restore results still require an environment drill.
