# Project index

Use this index to locate information and decide where changes belong. Paths are relative to the repository root. Maintain it whenever important files or folders change.

| Path | Short description |
| --- | --- |
| `README.md` | Prerequisites, portable build/run commands, health URLs, and reference layout. |
| `AGENTS.md` | Agent workflow, maintenance obligations, and recommended delegation. |
| `.agents/RULES.md` | Named rule catalog and links to individual rules. |
| `.agents/rules/` | One folder per rule, with its Markdown file and optional resources. |
| `.agents/skills/initialize-project/SKILL.md` | Post-clone .env setup, guided or approved field entry, and startup handoff. |
| `.agents/skills/start-restart/SKILL.md` | Local Start/Restart workflow. |
| `api/pom.xml` | Spring Boot 4.1.1, Java 25+, Maven 3.6.3+, dependencies, JAR build, and pinned Java formatting. |
| `api/src/main/java/ca/bc/gov/addresschange/api/AddressChangeApiApplication.java` | Spring Boot entry point and component-scan root. |
| `api/src/main/resources/application.yaml` | Port, application name, health exposure, and probes. |
| `api/src/test/java/ca/bc/gov/addresschange/api/HealthEndpointTest.java` | HTTP health/probe and endpoint exposure tests. |
| `api/src/main/java/ca/bc/gov/addresschange/api/constants/v1/URL.java` | Shared v1 SDG base path and address route suffix. |
| `api/src/main/java/ca/bc/gov/addresschange/api/endpoint/v1/` | Versioned HTTP mappings and OpenAPI contracts; SDG uses POST /api/v1/sdg/address. |
| `api/src/main/java/ca/bc/gov/addresschange/api/controller/v1/` | Implementations of the v1 endpoint contracts. |
| `api/src/main/java/ca/bc/gov/addresschange/api/exception/` | API-wide safe ProblemDetail responses for validation, HTTP errors, and unexpected failures. |
| `api/src/main/java/ca/bc/gov/addresschange/api/service/v1/` | SDG payload normalization into the Address Change contract. |
| `api/src/main/java/ca/bc/gov/addresschange/api/struct/v1/` | Separate Lombok DTO classes for incoming SDG, normalized Address Change, and acknowledgement contracts. |
| `api/src/test/java/ca/bc/gov/addresschange/api/SdgWebhookTest.java` | Webhook mapping, acknowledgement, and validation response tests. |
| `api/src/test/java/ca/bc/gov/addresschange/api/RestExceptionHandlerTest.java` | API-wide validation, safe errors, HTTP status, and method-header regression tests. |
| `api/src/test/resources/sdg-submission.json` | Synthetic SDG form example used by webhook tests. |
| `api/src/test/java/ca/bc/gov/addresschange/api/OpenApiSpecTest.java` | Exports the running app contract to api/target/openapi.json with -Popenapi-spec; Springdoc is test-only. |
| `tools/check_index.py` | Validates indexed paths, duplicates, and repository boundaries; skips generated output. |
| `tools/test_check_index.py` | Regression checks for index validation. |
| `.editorconfig` | Shared encoding, line endings, indentation, and whitespace settings. |
| `tools/test_app.py` | Lifecycle health regression tests for failed health and published ports. |
| `tools/OUTPUT.md` | Concise output, JSON schema, error codes, and local command logs. |
| `tools/app.py` | Shared Compose lifecycle, prerequisite checks, health verification, logs, wrapper tests, and Java formatting. |
| `mvnw` | Official Maven Wrapper for Unix-like environments. |
| `mvnw.cmd` | Official Maven Wrapper for Windows. |
| `.mvn/wrapper/maven-wrapper.properties` | Maven version, distribution URL, and checksum pin. |
| `tools/app.sh` | Bash convenience entry point forwarding to the portable Python helper. |
| `.github/workflows/check-agents-index.yml` | Checks index paths and checker tests on pushes and pull requests. |
| `.github/workflows/on-merge-deploy-to-dev.yml` | Builds the production image and deploys the latest revision to OpenShift DEV. |
| `.github/workflows/deploy-to-test.yml` | Promotes the latest tagged DEV image and matching main-branch manifests to OpenShift TEST. |
| `.github/workflows/deploy-to-prod.yml` | Promotes the latest tagged TEST image and matching main-branch manifests to OpenShift PROD. |
| `Dockerfile` | Multi-stage Java 25 production image using a non-root Alpine runtime. |
| `.github/workflows/docs.yml` | Validate and build docs on PRs; publish main to GitHub Pages. |
| `.github/workflows/openapi-spec.yml` | Generate from Java with the openapi-spec Maven profile, enrich metadata, lint, and upload for docs. |
| `.github/workflows/util/` | Pinned Spectral validator and rules; run npm ci then npm run lint:openapi here. |
| `Dockerfile.dev` | Local Maven development image; production packaging is separate. |
| `compose.yml` | Local API, optional formatter service, health check, source mounts, and Maven cache. |
| `tools/openshift/api-deployment.yaml` | Parameterized OpenShift Deployment, Service, health probes, and horizontal autoscaler. |
| `tools/openshift/config-map.yaml` | Empty parameterized application ConfigMap populated with non-sensitive settings as needed. |
| `tools/openshift/pod-disruption-budget.yaml` | Optional parameterized availability policy for TEST and PROD deployments with multiple replicas. |
| `.env.example` | Shared template for the local port; copy to ignored `.env`. |
| `.dockerignore` | Container build context exclusions. |
| `.gitignore` | Generated output, local tooling, and editor exclusions. |
| `.gitattributes` | Keeps Java and shell files on LF line endings and the Windows Maven Wrapper on CRLF. |
| `docs/` | Astro/Starlight docs; Node 22.19+ required. Run npm ci then npm run dev or npm run build here. |
| `docs/astro.config.mjs` | Navigation, BC government theme, and OpenAPI plugin configuration. |
| `docs/src/content/docs/index.md` | Basic Address Change documentation landing page. |
| `docs/src/styles/bc-gov.css` | Geocoder BC government styling; local BC Sans fonts are in docs/public/fonts/. |
| `docs/package.json` | Documentation scripts and pinned dependencies, locked by package-lock.json. |
| `LICENSE` | Existing project license. |
| `.run/` (generated, ignored) | Ignored scratch files and per-command logs under logs/. |
| `api/target/` (generated, ignored) | Executable JAR and test reports. |

As features are added, create `endpoint/` for HTTP contracts, `controller/` for implementations, `service/` for business logic, `repository/` and `model/` for persistence, and `struct/` for request/response objects beneath the Java package root. Add these paths here when they contain real code.
