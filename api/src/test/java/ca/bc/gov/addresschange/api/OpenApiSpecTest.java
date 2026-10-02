package ca.bc.gov.addresschange.api;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import tools.jackson.databind.json.JsonMapper;

@EnabledIfSystemProperty(named = "openapi.generate", matches = "true")
@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "springdoc.api-docs.version=OPENAPI_3_0")
class OpenApiSpecTest {
    @LocalServerPort private int port;

    @Test
    void exportOpenApiFromRunningApplication() throws Exception {
        var request =
                HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/v3/api-docs"))
                        .GET()
                        .build();
        var response =
                HttpClient.newHttpClient().send(request, HttpResponse.BodyHandlers.ofString());
        assertThat(response.statusCode()).isEqualTo(200);
        var document = JsonMapper.builder().build().readTree(response.body());
        assertThat(document.get("openapi").asString()).startsWith("3.");
        assertThat(document.get("paths").isObject()).isTrue();
        assertThat(document.get("paths").has("/actuator/health")).isFalse();
        assertThat(document.get("paths").has("/sdg/webhook")).isFalse();
        var webhook = document.get("paths").get("/api/v1/address/sdg").get("post");
        assertThat(webhook.get("operationId").asString()).isEqualTo("acceptSdgSubmission");
        assertThat(webhook.get("responses").has("202")).isTrue();
        assertThat(webhook.get("requestBody").get("required").asBoolean()).isTrue();
        var output = Path.of(System.getProperty("openapi.output"));
        Files.createDirectories(output.getParent());
        Files.writeString(output, response.body());
    }
}
