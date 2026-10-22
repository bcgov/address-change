# Common (OpenShift templates and tests)

- OpenShift templates (not Helm): `openshift.init.yml`, `openshift.database.yml`, `openshift.database-init.yml` (PR database credentials/policy). App templates are `backend/openshift.deploy.yml` and `frontend/openshift.deploy.yml`.
- TEST/PROD use Patroni provisioned by `loc-tools`; do not template a database for them here.
- Integration and load tests are in `tests/integration` and `tests/load`, run by `.github/workflows/reusable-tests.yml`.
- Use the `openshift-deployment` skill for template conventions.
