# Upstream source

This Patroni Helm chart is maintained as a LOC-specific fork of the BC
Government SSO Patroni chart.

- Repository: <https://github.com/bcgov/sso-helm-charts>
- Source path: `charts/patroni`
- Upstream commit: `80e2c56b8e4b9f93055712f382243d7d3ed60eb9`
- Chart version: `1.6.2`
- Application version: `3.2-p1`
- Vendored: 2026-10-07
- Upstream licence: Apache License 2.0; see `LICENSE.upstream`

Review and incorporate upstream changes explicitly. Keep this file current when
rebasing or copying a newer upstream chart so that local changes remain
traceable.

## LOC PostgreSQL 18 update

The upstream provenance above remains unchanged. LOC chart `2.0.0` changes
the local defaults to PostgreSQL 18 / `ghcr.io/zalando/spilo-18:4.1-p2`, pins
the additional-user hook client to `postgres:18.6-alpine`, and adds a
read-only data-version check before Patroni starts. These are local changes,
not a re-vendoring of the upstream chart.
