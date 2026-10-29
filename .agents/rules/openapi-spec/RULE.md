# Document endpoints in the contract

The OpenAPI spec is generated from the ts-rest contract (`backend/src/address-change/address-change.contract.ts`), not from controller decorators. The pre-commit hook, `npm test`, and the PR check regenerate and lint it; your part is the source:

- Give every contract route a `summary`, `description`, and `metadata` (`OpenApiRouteMetadata`: `operationId`, request and response examples), and declare every status code it can return, including 400s.
- Return 400s through `badRequestProblem` (`backend/src/common/problem-details.ts`) and never echo submitted values.
- Add new paths to the path summaries in `backend/src/openapi.config.ts`.
- Fix Spectral findings; do not add overrides to `.spectral.yaml` without the user's explicit permission.
