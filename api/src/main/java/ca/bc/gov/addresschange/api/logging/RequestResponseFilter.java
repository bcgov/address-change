package ca.bc.gov.addresschange.api.logging;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.UUID;
import org.jspecify.annotations.NullMarked;
import org.jspecify.annotations.Nullable;
import org.slf4j.MDC;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/** Establishes request context and logs completion for the API's synchronous servlet requests. */
@Component
@NullMarked
public class RequestResponseFilter extends OncePerRequestFilter {
    public static final String CORRELATION_HEADER = "Correlation-Id";

    @Override
    protected void doFilterInternal(
            HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        var previous = MDC.getCopyOfContextMap();
        long start = System.nanoTime();
        boolean failed = true;
        try {
            var correlation = safeHeader(request, CORRELATION_HEADER);
            if (correlation == null) correlation = UUID.randomUUID().toString();
            MDC.put("http.request.id", correlation);
            MDC.put("labels.loc_correlation_id", correlation);
            putHeader(request, "X-Client-Id", "client.id");
            // request_id is an edge-token claim, not a documented standalone header.
            MDC.remove("labels.sdx_request_id");
            putHeader(request, "X-Service-Id", "labels.sdx_service_id");
            response.setHeader(CORRELATION_HEADER, correlation);
            chain.doFilter(request, response);
            failed = false;
        } finally {
            try {
                LogHelper.logHttpCompletion(request, response, System.nanoTime() - start, failed);
            } finally {
                if (previous == null) MDC.clear();
                else MDC.setContextMap(previous);
            }
        }
    }

    private static void putHeader(HttpServletRequest request, String header, String field) {
        MDC.remove(field);
        var value = safeHeader(request, header);
        if (value != null) MDC.put(field, value);
    }

    private static @Nullable String safeHeader(HttpServletRequest request, String header) {
        var value = request.getHeader(header);
        return value != null && value.matches("[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}") ? value : null;
    }
}
