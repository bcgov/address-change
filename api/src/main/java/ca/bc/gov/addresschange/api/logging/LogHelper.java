package ca.bc.gov.addresschange.api.logging;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public final class LogHelper {
    private static final Logger LOG = LoggerFactory.getLogger(LogHelper.class);

    private LogHelper() {}

    public static void logHttpCompletion(
            HttpServletRequest request,
            HttpServletResponse response,
            long duration,
            boolean failed) {
        LOG.atInfo()
                .addKeyValue("event.kind", "event")
                .addKeyValue("event.category", List.of("web", "api"))
                .addKeyValue("event.type", List.of("access"))
                .addKeyValue("event.action", "http.request")
                .addKeyValue(
                        "event.outcome",
                        failed || response.getStatus() >= 400 ? "failure" : "success")
                .addKeyValue("event.duration", duration)
                .addKeyValue("http.request.method", request.getMethod())
                .addKeyValue("http.response.status_code", response.getStatus())
                .addKeyValue("url.path", request.getRequestURI())
                .log("HTTP request completed");
    }
}
