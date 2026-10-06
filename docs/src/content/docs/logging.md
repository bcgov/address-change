---
title: Application logging
---

The API writes one JSON object per console line for collection by the OpenShift logging pipeline. The flat ECS fields and nested `labels` follow [LOC-7077](https://dpdd.atlassian.net/wiki/spaces/POSM/pages/1609138179/LOC-7077+Assess+SDX+Audit+Logging). Collection, HIVE ingestion, retention, and access provisioning remain platform responsibilities and require environment validation.

`RequestResponseFilter` establishes MDC before synchronous servlet processing and restores the previous context in a finally block. `LogHelper` emits one completion event including errors and missing routes. Duration is a number in nanoseconds; category/type are arrays. Ordinary SLF4J logs receive the same service and request context through `EcsLogFormatter`. Async servlet endpoints are not currently implemented; adding them requires async completion and context propagation support.

Inbound headers follow the [SDX Data Access Protocol, Edge to IS Service request](https://developer.gov.bc.ca/docs/default/component/aps-infra-platform-docs/reference/sdx/data-access-protocol/#edge-to-is-service-request):

| Header | Log field |
| --- | --- |
| `Correlation-Id` | `http.request.id`, `labels.loc_correlation_id`; generated UUID if absent/invalid, echoed before processing |
| `X-Client-Id` | `client.id` |
| `X-Service-Id` | `labels.sdx_service_id` |

HTTP header names are case-insensitive. Identifiers must contain at most 128 ASCII letters, digits, or `._:/-` and start with a letter/digit. Missing or invalid optional identity fields are omitted. These values are logging metadata and do not authenticate a caller; deployment must establish the SDX gateway trust boundary separately.

The protocol also forwards `Authorization`, `X-Edge-Token`, and `Content-Digest`; the logging filter does not record or parse those values. `request_id` is an `X-Edge-Token` claim, not a standalone `X-Request-ID` header. Accordingly, `labels.sdx_request_id` is not populated until a verified token integration is implemented. `X-Correlation-ID` is not used; the supported correlation header is `Correlation-Id`. Missing headers remain acceptable for local requests and health probes.

Set `SERVICE_ID`, `SERVICE_VERSION`, and `SERVICE_ENVIRONMENT` in deployment configuration; environment defaults to `LOCAL` in both the base configuration and local profile. Deployment workflows inject `DEV`, `TEST`, or `PROD` into the required `SERVICE_ENVIRONMENT` ConfigMap parameter. The deployment imports that value through `envFrom`, and the formatter writes it as `service.environment`. Service name comes from `spring.application.name`.

Bodies, query strings, cookies, authorization headers, exception messages and stack traces are excluded to avoid logging personal addresses and credentials. Request paths and application-authored messages are logged; developers must keep personal data out of paths and log messages. Any future payload logging needs an explicit field allowlist and a justified privacy/retention policy.

## Downstream correlation propagation

Inject Spring Boot's `RestClient.Builder` into service constructors and build reusable clients from it:

```java
public ReferenceService(RestClient.Builder builder) {
    this.client = builder.baseUrl("https://reference-service").build();
}
```

`CorrelationRestClientCustomizer` automatically sends `Correlation-Id` from MDC's `http.request.id` on each synchronous call. It reads the value when executing the request, so a reused client follows each incoming request's context and replaces any conflicting correlation header. With no MDC correlation, it adds no header and leaves an explicitly configured header alone. It does not forward caller identity or credentials.

Use the injected builder: direct `RestClient.create()` / `RestClient.builder()` and other HTTP libraries bypass this customization. Async executors need explicit MDC propagation. Outbound completion logging and messaging propagation remain future integration work; there are no domain callouts yet.

## Configurable log levels

Log thresholds use the same environment-variable pattern as EDUC-STUDENT-API. The deployment already loads `${APP_NAME}-config` through `envFrom`. The ConfigMap template exposes these settings, defaulting to `INFO`:

| ConfigMap key | Scope |
| --- | --- |
| `ROOT_LOG_LEVEL` | Default for all loggers |
| `APP_LOG_LEVEL` | `ca.bc.gov.addresschange.api`, including HTTP completion events |
| `SPRING_WEB_LOG_LEVEL` | `org.springframework.web` |
| `SPRING_BOOT_AUTOCONFIG_LOG_LEVEL` | `org.springframework.boot.autoconfigure.logging` |

Use `TRACE`, `DEBUG`, `INFO`, `WARN`, `ERROR`, or `OFF`. For example, set `APP_LOG_LEVEL: "DEBUG"` to enable application debug messages while keeping framework logs at `INFO`. With no explicit scope override, application.yaml inherits `ROOT_LOG_LEVEL`; the ConfigMap template supplies explicit `INFO` overrides for each scope.

Levels are thresholds: `ERROR` suppresses INFO HTTP completion events. Keep `APP_LOG_LEVEL` at `INFO` or `DEBUG` when those events are required. Debugging framework code may produce additional diagnostic data, so use framework DEBUG/TRACE with care around personal data.

The DEV/TEST/PROD deployment workflows inject these four settings from GitHub Actions configuration variables in their respective `dev`, `test`, and `prod` environments into the ConfigMap template parameters. Configure the same variable names independently under each GitHub environment. For example, use `APP_LOG_LEVEL=DEBUG` in DEV and `APP_LOG_LEVEL=INFO` or `ERROR` in TEST/PROD. Without a configured variable, application logging defaults to `DEBUG` in DEV and `INFO` in TEST/PROD; root and Spring logging default to `INFO` everywhere. Repository-level variables can supply shared values, with environment-level variables overriding them.

Manual ConfigMap changes are replaced by these injected values on the next deployment. Store durable overrides in GitHub environment variables, then run the corresponding deployment workflow.

After changing ConfigMap values, roll out/restart the deployment: environment variables are read when each pod starts, so existing pods do not update automatically. Changes to thresholds preserve the ECS JSON format. No log-level Actuator endpoint is exposed.
