package ca.bc.gov.addresschange.api.logging;

import org.jspecify.annotations.NullMarked;
import org.slf4j.MDC;
import org.springframework.boot.restclient.RestClientCustomizer;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

/** Propagates the current request correlation at execution time, not client creation time. */
@Component
@NullMarked
public class CorrelationRestClientCustomizer implements RestClientCustomizer {
    @Override
    public void customize(RestClient.Builder builder) {
        builder.requestInterceptor(
                (request, body, execution) -> {
                    var correlation = MDC.get("http.request.id");
                    if (correlation != null && !correlation.isBlank()) {
                        request.getHeaders()
                                .set(RequestResponseFilter.CORRELATION_HEADER, correlation);
                    }
                    return execution.execute(request, body);
                });
    }
}
