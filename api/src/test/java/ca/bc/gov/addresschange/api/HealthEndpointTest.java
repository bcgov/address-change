package ca.bc.gov.addresschange.api;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import tools.jackson.databind.json.JsonMapper;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class HealthEndpointTest {
    @LocalServerPort private int port;

    @Test
    void healthAndProbesReportUpWithoutExposingDetails() throws Exception {
        for (String path :
                new String[] {
                    "/actuator/health", "/actuator/health/liveness", "/actuator/health/readiness"
                }) {
            var response = get(path);
            assertThat(response.statusCode()).isEqualTo(200);
            var body = JsonMapper.builder().build().readTree(response.body());
            assertThat(body.get("status").asString()).isEqualTo("UP");
            assertThat(body.has("components")).isFalse();
            assertThat(body.has("details")).isFalse();
        }
    }

    @Test
    void internalActuatorEndpointsAreNotExposed() throws Exception {
        assertThat(get("/actuator/env").statusCode()).isEqualTo(404);
    }

    private HttpResponse<String> get(String path) throws Exception {
        var client = HttpClient.newHttpClient();
        var request =
                HttpRequest.newBuilder(URI.create("http://localhost:" + port + path)).GET().build();
        return client.send(request, HttpResponse.BodyHandlers.ofString());
    }
}
