package ca.bc.gov.addresschange.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.headerDoesNotExist;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import ca.bc.gov.addresschange.api.logging.RequestResponseFilter;
import org.junit.jupiter.api.Test;
import org.slf4j.MDC;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

@SpringBootTest
class CorrelationCalloutTest {
    @Autowired private RestClient.Builder builder;
    @Autowired private RequestResponseFilter filter;

    @Test
    void reusableClientInheritsEachRequestsCorrelationWithoutLeakingContext() throws Exception {
        var server = MockRestServiceServer.bindTo(builder).build();
        var client = builder.build();
        server.expect(requestTo("https://downstream.example/test"))
                .andExpect(header("Correlation-Id", "inbound-123"))
                .andExpect(headerDoesNotExist("X-Client-Id"))
                .andExpect(headerDoesNotExist("Authorization"))
                .andRespond(withSuccess("ok", MediaType.TEXT_PLAIN));
        server.expect(requestTo("https://downstream.example/test"))
                .andExpect(header("Correlation-Id", "next-456"))
                .andRespond(withSuccess("ok", MediaType.TEXT_PLAIN));
        server.expect(requestTo("https://downstream.example/test"))
                .andExpect(headerDoesNotExist("Correlation-Id"))
                .andRespond(withSuccess("ok", MediaType.TEXT_PLAIN));
        try {
            for (var correlation : java.util.List.of("inbound-123", "next-456")) {
                var request = new MockHttpServletRequest("GET", "/test");
                request.addHeader("Correlation-Id", correlation);
                request.addHeader("X-Client-Id", "MIN.CITZ.SDG");
                filter.doFilter(
                        request,
                        new MockHttpServletResponse(),
                        (_, _) ->
                                assertThat(
                                                client.get()
                                                        .uri("https://downstream.example/test")
                                                        .header("Correlation-Id", "stale-default")
                                                        .retrieve()
                                                        .body(String.class))
                                        .isEqualTo("ok"));
            }
            assertThat(MDC.get("http.request.id")).isNull();
            assertThat(
                            client.get()
                                    .uri("https://downstream.example/test")
                                    .retrieve()
                                    .body(String.class))
                    .isEqualTo("ok");
            server.verify();
        } finally {
            MDC.clear();
        }
    }
}
