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
        try {
            var request = new MockHttpServletRequest("POST", "/api/v1/sdg/address");
            request.addHeader("X-Correlation-ID", "correlation-123");
            request.addHeader("X-Client-ID", "calling-system");
            request.addHeader("X-Request-ID", "gateway-123");
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
                                assertThat(response.getHeader("X-Correlation-ID"))
                                        .isEqualTo("correlation-123");
                                response.setStatus(400);
                            });
            assertThat(MDC.getCopyOfContextMap()).containsOnlyKeys("existing");
            var json = new EcsLogFormatter(new MockEnvironment()).format(appender.list.getFirst());
            assertThat(json).doesNotContain("PRIVATE", "Authorization", "existing");
            var event = JsonMapper.builder().build().readTree(json);
            assertThat(event.get("http.response.status_code").asInt()).isEqualTo(400);
            assertThat(event.get("event.duration").isNumber()).isTrue();
            assertThat(event.get("event.category").isArray()).isTrue();
            assertThat(event.get("event.outcome").asString()).isEqualTo("failure");
            assertThat(event.get("labels").get("sdx_request_id").asString())
                    .isEqualTo("gateway-123");
        } finally {
            MDC.clear();
            logger.detachAppender(appender);
        }
    }

    @Test
    void generatesCorrelationAndCleansUpAfterUnhandledFailure() {
        var request = new MockHttpServletRequest("GET", "/missing");
        request.addHeader("X-Correlation-ID", "unsafe identifier");
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
                                        response.getHeader("X-Correlation-ID"))))
                .isNotNull();
        assertThat(MDC.getCopyOfContextMap()).isNullOrEmpty();
    }
}
