# Address Change database bootstrap

For the Address Change Vault deployment and migration procedure, see the
[database Vault guide](../address-change-db-permissions/VAULT.md). The chart
retains its legacy OpenShift Secret mode for existing callers.


This chart uses a PostgreSQL 18 client to provision application-specific
resources in the existing PostgreSQL 18 Patroni cluster without making the generic Patroni chart responsible for an individual
application's schema.

It creates:

- the `address_change` database and schema;
- a migration role that owns the database and schema;
- a least-privilege runtime role;
- separate Kubernetes Secrets for the migration and runtime credentials; and
- an idempotent post-install/post-upgrade Job that reconciles the roles,
  passwords, ownership, and grants; and
- a NetworkPolicy permitting only the bootstrap Job and `database-client: address-change`
  pods to connect to the Patroni pods on port 5432.

The generated passwords are retained across normal Helm upgrades by looking up
the existing Secrets. Do not supply passwords through a values file or commit
rendered Secret manifests.

## Install

The Patroni release must be healthy before this chart is installed.

```sh
helm dependency build ./helm/charts/address-change-db-bootstrap
helm upgrade --install address-change-db-bootstrap \
  ./helm/charts/address-change-db-bootstrap \
  --namespace b5cfc6-dev \
  --rollback-on-failure \
  --wait \
  --timeout 5m
```

## Application consumption

The address-change runtime should read `username` and `password` from the
`address-change-db-runtime` Secret. The more privileged
`address-change-db-migration` Secret should only be exposed to Flyway or another
migration process.

The credentials are intentionally not printed by this chart. Kubernetes Secret
data and Helm release data must both be treated as sensitive.

## Address-change integration

Install Patroni, this chart, and the backup chart in each TEST/PROD application
namespace. Backend pods connect using the label `database-client: address-change`.
PR previews keep separate disposable databases.

The application connects to `address-change-db-patroni:5432/address_change`,
schema `address_change`, with TLS required. Runtime and migration Secrets use
`username` and `password` keys. Add application tables through address-change's
Flyway migrations; backup restore verification requires application tables.
