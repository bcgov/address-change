package ca.bc.gov.addresschange.api;

import static org.assertj.core.api.Assertions.assertThat;

import ca.bc.gov.addresschange.api.logging.EcsLogFormatter;
import ca.bc.gov.addresschange.api.logging.RequestResponseFilter;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import tools.jackson.databind.json.JsonMapper;

class RequestLoggingTest {
    @Test
    void emitsTypedEcsEventAndRestoresContextWithoutPersonalData() throws Exception {
        var logger =
                (Logger)
                        LoggerFactory.getLogger(
                                ca.bc.gov.addresschange.api.logging.LogHelper.class);
        var appender = new ListAppender<ILoggingEvent>();
        appender.start();
        logger.addAppender(appender);
        MDC.put("existing", "preserve");
        MDC.put("labels.sdx_request_id", "outer-request");
        try {
            var request = new MockHttpServletRequest("POST", "/api/v1/sdg/address");
            request.addHeader("Correlation-Id", "correlation-123");
            request.addHeader("x-client-id", "MIN.CITZ.SDG");
            request.addHeader("X-Service-Id", "MIN.LOC.ADDRESS-CHANGE.v1");
            request.addHeader("X-Request-ID", "undocumented-request");
            request.addHeader("X-Edge-Token", "PRIVATE.token.signature");
            request.addHeader("Content-Digest", "sha-256=:PRIVATE:");
            request.addHeader("Authorization", "Bearer PRIVATE");
            request.setQueryString("address=PRIVATE");
            request.setContent("PRIVATE".getBytes());
            var response = new MockHttpServletResponse();
            new RequestResponseFilter()
                    .doFilter(
                            request,
                            response,
                            (_, _) -> {
                                assertThat(MDC.get("http.request.id")).isEqualTo("correlation-123");
                                assertThat(response.getHeader("Correlation-Id"))
                                        .isEqualTo("correlation-123");
                                response.setStatus(400);
                            });
            assertThat(MDC.getCopyOfContextMap())
                    .containsOnlyKeys("existing", "labels.sdx_request_id")
                    .containsEntry("labels.sdx_request_id", "outer-request");
            var json = new EcsLogFormatter(new MockEnvironment()).format(appender.list.getFirst());
            assertThat(json).doesNotContain("PRIVATE", "Authorization", "existing");
            var event = JsonMapper.builder().build().readTree(json);
            assertThat(event.get("http.response.status_code").asInt()).isEqualTo(400);
            assertThat(event.get("event.duration").isNumber()).isTrue();
            assertThat(event.get("event.category").isArray()).isTrue();
            assertThat(event.get("event.outcome").asString()).isEqualTo("failure");
            assertThat(event.get("client.id").asString()).isEqualTo("MIN.CITZ.SDG");
            assertThat(event.get("labels").get("sdx_service_id").asString())
                    .isEqualTo("MIN.LOC.ADDRESS-CHANGE.v1");
            assertThat(event.get("labels").has("sdx_request_id")).isFalse();
            assertThat(json)
                    .doesNotContain("undocumented-request", "Content-Digest", "X-Edge-Token");
        } finally {
            MDC.clear();
            logger.detachAppender(appender);
        }
    }

    @Test
    void generatesCorrelationAndCleansUpAfterUnhandledFailure() {
        var request = new MockHttpServletRequest("GET", "/missing");
        request.addHeader("Correlation-Id", "unsafe identifier");
        var response = new MockHttpServletResponse();
        org.junit.jupiter.api.Assertions.assertThrows(
                jakarta.servlet.ServletException.class,
                () ->
                        new RequestResponseFilter()
                                .doFilter(
                                        request,
                                        response,
                                        (_, _) -> {
                                            throw new jakarta.servlet.ServletException("PRIVATE");
                                        }));
        assertThat(
                        java.util.UUID.fromString(
                                java.util.Objects.requireNonNull(
                                        response.getHeader("Correlation-Id"))))
                .isNotNull();
        assertThat(MDC.getCopyOfContextMap()).isNullOrEmpty();
    }
}
