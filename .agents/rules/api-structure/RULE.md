# API structure and verification

Keep the Maven application in `api/` and operational helpers in `tools/`. Keep components beneath `ca.bc.gov.addresschange.api`. Add layers when features need them.

Keep Spring Boot pinned to 4.1.1 unless a version change is requested. Require Java 17+ and Maven 3.6.3+. Use Boot dependency management and keep environment-specific secrets outside source control.

Run `python tools/app.py test` for application changes. Health is provided by Actuator at `/actuator/health`. Preserve the health contract and test meaningful behavioral changes. Report checks that could not run and why.

Java formatting uses pinned Spotless and google-java-format with AOSP style (four spaces). Run `python tools/app.py format` to apply or `python tools/app.py format-check` to check. The apply command runs the dedicated `formatter` service in `compose.yml`, behind the `tools` profile, with writable sources in a temporary container. Normal development and format checks use the read-only API service. Maven `verify` checks formatting without changing files. With a host JDK, equivalent commands are `sh ./mvnw -f api/pom.xml spotless:apply` and `sh ./mvnw -f api/pom.xml spotless:check`.
