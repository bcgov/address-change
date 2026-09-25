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
| `api/pom.xml` | Spring Boot 4.1.1, Java 17+, Maven 3.6.3+, dependencies, JAR build, and pinned Java formatting. |
| `api/src/main/java/ca/bc/gov/addresschange/api/AddressChangeApiApplication.java` | Spring Boot entry point and component-scan root. |
| `api/src/main/resources/application.yaml` | Port, application name, health exposure, and probes. |
| `api/src/test/java/ca/bc/gov/addresschange/api/HealthEndpointTest.java` | HTTP health/probe and endpoint exposure tests. |
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
| `Dockerfile.dev` | Local Maven development image; production packaging is separate. |
| `compose.yml` | Local API, optional formatter service, health check, source mounts, and Maven cache. |
| `.env.example` | Shared template for the local port; copy to ignored `.env`. |
| `.dockerignore` | Container build context exclusions. |
| `.gitignore` | Generated output, local tooling, and editor exclusions. |
| `.gitattributes` | Keeps shell scripts on Linux-compatible LF line endings. |
| `LICENSE` | Existing project license. |
| `.run/` (generated, ignored) | Ignored scratch files and per-command logs under logs/. |
| `api/target/` (generated, ignored) | Executable JAR and test reports. |

As features are added, create `endpoint/` for HTTP contracts, `controller/` for implementations, `service/` for business logic, `repository/` and `model/` for persistence, and `struct/` for request/response objects beneath the Java package root. Add these paths here when they contain real code.
