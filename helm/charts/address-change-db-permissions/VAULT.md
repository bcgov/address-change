# Address Change database credentials in Vault

The database operations workflow enables Vault for TEST/PROD. DEV/PR previews
continue to use disposable PostgreSQL and generated OpenShift Secrets.

## Prepare the existing credentials

Create the following entries under the environment's base path using the Vault
UI or CLI. Store each field as a string. For existing clusters, copy the current
decoded OpenShift values exactly.

| Environment | Base path |
| --- | --- |
| TEST | `b5cfc6-nonprod/address-change-api-test/address-change-db` |
| PROD | `b5cfc6-prod/address-change-api-prod/address-change-db` |

| Entry | Fields | Existing OpenShift source |
| --- | --- | --- |
| `migration` | `username`, `password` | `address-change-db-migration` |
| `runtime` | `username`, `password` | `address-change-db-runtime` |
| `backup` | `username`, `password` | `address-change-db-backup` |
| `patroni-superuser` | `username`, `password` | `address-change-db-patroni` superuser fields |
| `patroni-admin` | `username`, `password` | `address-change-db-patroni` admin fields |
| `patroni-replication` | `username`, `password` | `address-change-db-patroni` standby fields |

The S3 entry defaults to the sibling `address-change-s3` entry already used by
the application. It needs string keys `AWS_ACCESS_KEY_ID` and
`AWS_SECRET_ACCESS_KEY`. A separate backup identity can be selected with the
workflow's `VAULT_S3_PATH` variable.

For a new environment, generate the passwords and save them in Vault first.
The platform's `b5cfc6-vault` service account has read access, so these charts
consume prepared values rather than creating or writing Vault credentials.

## Chart settings

For direct Helm commands, use a non-secret values file containing the following
settings. KV v2 API paths include `/data/` after the mount.

```yaml
vault:
  enabled: true
  namespace: platform-services
  authPath: auth/k8s-gold
  role: b5cfc6-nonprod
  serviceAccountName: b5cfc6-vault
  databasePath: b5cfc6-nonprod/data/address-change-api-test/address-change-db
  s3Path: b5cfc6-nonprod/data/address-change-api-test/address-change-s3
```

The workflow supplies these values for TEST/PROD. It retains `OC_TOKEN` in
GitHub for deployment authentication. Runtime database and S3 credentials are
retrieved inside the pods through Kubernetes authentication.

The charts use a shared Helm library to generate Vault Agent annotations and
small environment-loading scripts. Secret fields are base64-encoded by the
Agent, decoded at startup, and exported without shell interpretation of their
contents. Trailing newlines are preserved. Manual S3 commands reload the
injected scripts as well.

## Migrate TEST before PROD

1. Capture reviewed, non-secret Helm settings and confirm the Vault entries
   contain the exact current values. Confirm service-account and Vault access,
   image pulls, and quota for the injected Agent.
2. Deploy the application's Vault database migration first and verify API,
   worker, and Flyway connectivity. An old application deployment may still
   require the Kubernetes Secrets.
3. Build dependencies for each chart. Run `configure-patroni` in TEST, which
   upgrades the existing StatefulSet with Vault startup. This is a rolling
   database update. Observe cluster health and replication during the rollout.
   Never uninstall Patroni or its PVCs as part of this migration.
4. Run `bootstrap`. Its Job reconciles the application roles with their Vault
   passwords. Use the existing values to avoid an unintended password rotation.
5. Run `deploy-backup`, then manually run an S3 backup and verification.
   Run a recovery drill into a fresh scratch database and check app credentials
   and data before repeating the migration in PROD.

**Enabling Vault removes chart-owned credential Secret manifests. Helm can
delete those existing Secrets during upgrade.** Complete the application
migration first and account for other consumers before proceeding. Backups of
the existing credentials must be safely retained in Vault. Helm release history
from previous installations can still contain the old credentials.

Patroni uses the platform Vault service account and grants it the chart's
namespace-scoped coordination Role. The original Patroni service account and
its RoleBinding access remain available so old pods can coordinate during the
rolling update. Review and remove that legacy account separately after the
transition if desired. Patroni still needs a Kubernetes API token for cluster
coordination. Administrative Jobs and S3 backup pods instead project a
short-lived token used only by the Vault Agent.

Application roles, backup roles, and Patroni roles are loaded only by workloads
that need them. All use the platform's environment Vault role. Actual Vault
read permissions follow that role's policies and should be reviewed separately
if workload-specific restrictions are needed.

## Recovery and maintenance

Use the [recovery runbook](../address-change-db-backup/RECOVERY.md) after
installing the Vault-enabled backup release. Recovery reads admin credentials
and application usernames from Vault and preserves existing PostgreSQL roles.

A Vault update requires pod replacement for new values to be injected.
Coordinate password rotations with PostgreSQL role updates and every consumer.
A Helm upgrade of the backup workflow explicitly restarts its Deployment.
The standalone recovery Job reads the current Vault values on each new pod.

Vault mode for backup uses S3 storage. The legacy PVC dependency is disabled.
Patroni's optional `additionalCredentials` hook is replaced by the
application-specific bootstrap chart in this mode.

## Local checks

Build dependencies, then run these checks with Helm, Python and PyYAML.

```sh
python3 helm/charts/address-change-db-permissions/tests/test_vault.py
python3 helm/charts/address-change-db-backup/tests/test_chart.py
python3 helm/charts/patroni/tests/test_chart.py
```

The templates also require an environment restore drill. Local rendering does
not prove Vault policies, cluster network access, or live Patroni rollout health.
