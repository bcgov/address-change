# Address Change database backups

This chart adds nightly backups of the address_change schema in the existing Patroni database,
using S3 or PVC storage. Both modes use the BC Government backup container.
PVC mode uses the [BC Government backup chart](https://github.com/bcgov/helm-charts/tree/master/charts/backup-storage).

It creates:

- a backup deployment with one replica and a Recreate update strategy;
- a nightly backup at 03:00 and restore verification at 06:00, using
  `America/Vancouver`;
- temporary disk volumes in S3 mode, or separate persistent volumes in PVC mode;
- a read-only backup role using credentials from Vault (or a Kubernetes Secret in legacy mode);
- an idempotent post-install/post-upgrade Job that reconciles the backup role; and
- a NetworkPolicy permitting the backup deployment and provisioning Job to
  connect to the Patroni pods on port 5432.

Scheduled and documented manual operations share a lock to prevent overlapping
runs. Restore verification restores the latest backup into an isolated database
and checks for tables in the `address_change` schema, then removes the temporary
restored database. It leaves the live database untouched.

Vault mode uses the prepared backup password. In legacy mode, the generated
password is retained across normal Helm upgrades. Do not supply the PostgreSQL
backup password through a values file or commit rendered Secret manifests. The backup
role has `pg_read_all_data`, which can read all accessible databases in this
Patroni cluster; reassess its permissions if the cluster becomes shared or uses
row-level security.

## S3 storage and recovery

S3 mode uses the same release and PostgreSQL 18 backup image. The nightly job
uploads a completed archive, and the verification job downloads the newest
archive and restores it locally. The Deployment uses disk-backed `emptyDir`
volumes for staging and verification. Size them for the compressed archive and
the restored database. Recovery staging must fit both the compressed archive
and its uncompressed SQL. Account for node ephemeral storage and namespace
quota where applicable. The init container supplies a pinned AWS CLI client.
S3 requests use HTTPS and path-style addressing. Set `s3.region` if the
provider requires a signing region other than the default `us-east-1`.

Before switching an existing release, **copy any PVC archives you want to keep
to independent storage**. Helm removes the old chart-owned PVCs when the PVC
dependency is disabled. Confirm the copies are readable before upgrading.

The database operations workflow uses Vault for database and S3 credentials.
Follow the [database Vault migration guide](../address-change-db-permissions/VAULT.md)
before upgrading an existing release. The lower-level chart still supports
legacy OpenShift Secrets when `vault.enabled=false`.

In Vault mode, `vault.s3Path` identifies the secret with
`AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`. The workflow defaults to the
application's environment-specific `address-change-s3` path. Use the
`VAULT_S3_PATH` GitHub variable for a separate backup identity. Endpoint, bucket,
prefix, and region remain non-secret deployment settings. Use a bucket lifecycle
rule scoped to the backup prefix for archive retention.

Use a values file such as `test-s3.yaml` containing only non-secret settings.

```yaml
backup-storage:
  enabled: false
s3:
  endpoint: https://nrs.objectstore.gov.bc.ca:443
  bucket: acstst
  prefix: address_change_db_backups
vault:
  enabled: true
  namespace: platform-services
  authPath: auth/k8s-gold
  role: b5cfc6-nonprod
  serviceAccountName: b5cfc6-vault
  databasePath: b5cfc6-nonprod/data/address-change-api-test/address-change-db
  s3Path: b5cfc6-nonprod/data/address-change-api-test/address-change-s3
```

```sh
helm dependency build ./helm/charts/address-change-db-backup
helm upgrade --install address-change-db-backup ./helm/charts/address-change-db-backup \
  -n b5cfc6-test -f ./helm/charts/address-change-db-backup/environments/test.yaml \
  -f test-s3.yaml --wait --timeout 15m

oc -n b5cfc6-test exec deployment/address-change-db-backup-s3 -- \
  flock -n /backups/.operation.lock /bin/bash /ac-backup/s3-operations.sh backup
oc -n b5cfc6-test exec deployment/address-change-db-backup-s3 -- \
  flock -n /backups/.operation.lock /bin/bash /ac-backup/s3-operations.sh verify
```

For incident recovery or a restore drill, follow the [database recovery runbook](RECOVERY.md).

## GitHub Actions

Use **Actions → Address Change database operations → Run workflow** in
`address-change` and select TEST or PROD.

- For a fresh namespace with Vault credentials prepared, run
  `provision-patroni`, `bootstrap`, then `deploy-backup`.
- For an existing Patroni cluster, use `configure-patroni` to switch its startup
  to Vault through a Helm upgrade. Review the migration guide first.
- Run `recover` with an unused database name and optionally a known-good archive
  filename after the backup release is installed.

| Setting | Where | Purpose |
| --- | --- | --- |
| `OC_SERVER`, `OC_NAMESPACE` | Variables | OpenShift API URL and target namespace |
| `OC_TOKEN` | Secret | Deployment-only OpenShift access |
| `S3_ENDPOINT`, `S3_BUCKET` | Variables | Backup destination |
| `S3_PREFIX`, `S3_REGION` | Optional variables | Defaults `address_change_db_backups`, `us-east-1` |
| `VAULT_S3_PATH` | Optional variable | Override the default application S3 KV v2 API path |

The workflow derives Vault role, service account, and database paths from
`OC_NAMESPACE` and the selected environment. It does not read S3 credentials
from GitHub secrets or create Kubernetes credential Secrets in Vault mode.
DEV/PR databases remain managed by the application's disposable database flow.

## Legacy installation with PVC storage

This mode uses Kubernetes Secrets and is not used by the TEST/PROD workflow.

The Patroni and database-bootstrap releases must be healthy before this chart is
installed. Run from the repository root, selecting the namespace and values file
for the target environment.

```sh
helm repo add bcgov https://bcgov.github.io/helm-charts
helm repo update
helm dependency build ./helm/charts/address-change-db-backup
helm upgrade --install address-change-db-backup \
  ./helm/charts/address-change-db-backup \
  --namespace b5cfc6-dev \
  --values ./helm/charts/address-change-db-backup/environments/dev.yaml \
  --wait \
  --timeout 15m
```

After upgrades, restart the deployment to load changed configuration:

```sh
oc -n b5cfc6-dev rollout restart deployment/address-change-db-backup
oc -n b5cfc6-dev rollout status deployment/address-change-db-backup --timeout=5m
```

The provisioning Job must also succeed before installation is complete. Its ten-minute deadline includes image pulls and can be adjusted with provisioning.activeDeadlineSeconds. Preserve
backup volumes during maintenance; Helm uninstall removes chart-owned PVCs.

## PostgreSQL version

Patroni and the role-provisioning client now target PostgreSQL 18; the client
is pinned to `postgres:18.6-alpine`. The retained `2.13.1` backup image also uses
PostgreSQL 18 for dump tools and isolated restore verification. Verify the
bundled patch versions at deployment time; matching major versions does not
establish identical patch levels. Existing verification volumes are unchanged.

## PVC configuration

The upstream chart is pinned to `0.1.18` and the container to `2.13.1`. Storage
starts at 5Gi for backups and 2Gi for verification; confirm quota and size both
volumes for the database, retention, and growth.

| Environment | Daily copies | Weekly copies | Monthly copies |
| --- | --- | --- | --- |
| DEV | 6 | 1 | 0 |
| TEST | 6 | 1 | 0 |
| PROD | 6 | 1 | 0 |

These are proposed retention defaults. The upstream rolling strategy classifies
Monday-Saturday backups as daily, Sunday as weekly, and month-end as monthly.

When changing the database endpoint, update `database`, `backup-storage.backupConfig`,
`adminCredentials`, and the Patroni selector together. When changing the backup
Secret name, update both `backupRole.secretName` and `backup-storage.db.secretName`.
Scheduled dumps require TLS; verification uses `PGSSLMODE=prefer` for its local
server and metadata queries. Confirm the platform's backup storage protection.

## PVC manual operations

```sh
# Create a backup.
MSYS_NO_PATHCONV=1 oc -n b5cfc6-dev exec deployment/address-change-db-backup -- \
  env PGSSLMODE=require flock -n /backups/.operation.lock /bin/bash /backup.sh -1
# List backups.
MSYS_NO_PATHCONV=1 oc -n b5cfc6-dev exec deployment/address-change-db-backup -- /bin/bash /backup.sh -l
# Verify the latest backup.
MSYS_NO_PATHCONV=1 oc -n b5cfc6-dev exec deployment/address-change-db-backup -- \
  flock -n /backups/.operation.lock /bin/bash /backup.sh -s -v all
# Review backup and verification results.
oc -n b5cfc6-dev logs deployment/address-change-db-backup --since=24h
```

## Production readiness and recovery

Container `2.13.1` and the Patroni database both target PostgreSQL 18.
Before PROD, prove recovery into a fresh PostgreSQL 18 target and check schema,
records, extensions, role grants, and API behavior. Verification requires at
least one application table. Platform schemas and extensions are excluded. Restore
errors are not ignored; logs and notifications must be checked because the
upstream script's exit status alone does not establish success.

In PVC mode, configure the webhook by referencing an existing Secret:

```yaml
backup-storage:
  env:
    WEBHOOK_URL:
      secure: false
      existingSecret:
        name: address-change-backup-alerts
        key: webhook-url
```

Also configure independent monitoring for a successful backup older than 26
hours, failed verification, skipped runs, unavailable backup pods, and storage
usage. Test failure alerts and the retention policy before production use. In S3 mode,
monitor upload and verification results and apply retention through the bucket
lifecycle rule.

Follow the [recovery runbook](RECOVERY.md) for archive selection, restore,
validation, cutover, and rollback.

## Verification

With Python, PyYAML, Helm, and the chart dependency installed:

```sh
helm lint ./helm/charts/address-change-db-backup --strict
python helm/charts/address-change-db-backup/tests/test_chart.py --helm helm
```

These checks render locally without connecting to a cluster or printing
credentials. They do not replace a database restore drill.

## Backup scope and role ordering

The pinned upstream PostgreSQL plugin appends roles after database objects.
Our mounted plugin writes the password-free role definitions first, so strict
restoration can resolve schema/table owners such as address_change_migration.
The dump includes only address_change objects and data, plus password-free role
metadata for ownership and grants. Other schemas and platform extensions such as
pg_stat_kcache are excluded. Any extension dependencies needed by application
objects must be provisioned separately on a recovery target. The dump fails if
the requested schema is absent. Both dump pipelines propagate failures.
Create a new backup after upgrading;
previous archives retain their original ordering. Do not enable ignore-errors
verification to bypass this failure.

DEV requests a 2Gi backup volume to fit the current namespace quota; verification
remains 2Gi. Reassess capacity as data grows.

## Upstream source and license

The plugin embedded in `values.yaml` under `backup-storage.config` is adapted
from [bcgov/backup-container 2.13.1](https://github.com/bcgov/backup-container/blob/2.13.1/docker/backup.postgres.plugin).
The upstream file's Git blob SHA is `19a490a09df52440db62fbcac38a1e6f5d9a0aa3`.
Its Apache 2.0 license is retained in [LICENSE.upstream](LICENSE.upstream).

Our changes are confined to `onBackupDatabase`:

- Write filtered, password-free role definitions before database objects so
  ownership and grants can be restored.
- Dump only `address_change` using `--schema=address_change --strict-names`.
- Enable `pipefail` for both pipelines and return either pipeline's failure.
- Skip the database dump if the role dump fails.

The remaining restore and verification behavior follows upstream. Review this
customization when updating the image: a ConfigMap mounts the plugin over
`/backup.postgres.plugin`. Change the plugin revision pod annotation when
updating the override so the deployment reloads the mounted file.
