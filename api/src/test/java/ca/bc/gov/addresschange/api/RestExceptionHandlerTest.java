package ca.bc.gov.addresschange.api;

import static org.assertj.core.api.Assertions.assertThat;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.json.JsonMapper;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(RestExceptionHandlerTest.OtherController.class)
class RestExceptionHandlerTest {
    @LocalServerPort private int port;
    private final JsonMapper mapper = JsonMapper.builder().build();

    private HttpResponse<String> send(String path, String method, String contentType, String body)
            throws Exception {
        var request =
                HttpRequest.newBuilder(URI.create("http://localhost:" + port + path))
                        .header("Content-Type", contentType)
                        .method(method, HttpRequest.BodyPublishers.ofString(body))
                        .build();
        return HttpClient.newHttpClient().send(request, HttpResponse.BodyHandlers.ofString());
    }

    private void assertProblem(HttpResponse<String> response, int status) throws Exception {
        assertThat(response.statusCode()).isEqualTo(status);
        assertThat(response.headers().firstValue("Content-Type").orElse(""))
                .startsWith("application/problem+json");
        assertThat(mapper.readTree(response.body()).get("status").asInt()).isEqualTo(status);
        assertThat(response.body()).doesNotContain("PRIVATE", "SDG", "Exception");
    }

    @Test
    void handlesValidationAndMalformedJsonForAnotherController() throws Exception {
        assertProblem(send("/test/other", "POST", "application/json", "{\"name\":\"\"}"), 400);
        assertProblem(send("/test/other", "POST", "application/json", "{PRIVATE"), 400);
    }

    @Test
    void preservesHttpStatusesAndMethodHeaders() throws Exception {
        assertProblem(send("/api/v1/address/sdg", "POST", "text/plain", "PRIVATE"), 415);
        var unsupportedMethod = send("/api/v1/address/sdg", "PUT", "application/json", "{}");
        assertProblem(unsupportedMethod, 405);
        assertThat(unsupportedMethod.headers().firstValue("Allow").orElse("")).contains("POST");
        assertProblem(send("/test/missing", "GET", "application/json", ""), 404);
        assertProblem(send("/sdg/webhook", "POST", "application/json", "{}"), 404);
    }

    @Test
    void hidesUnexpectedExceptionDetails() throws Exception {
        assertProblem(send("/test/failure", "GET", "application/json", ""), 500);
    }

    @Test
    void preservesOtherClientErrorStatusesWithoutExposingExceptionDetails() throws Exception {
        var response = send("/test/conflict", "GET", "application/json", "");
        assertProblem(response, 409);
        assertThat(mapper.readTree(response.body()).get("detail").asString())
                .isEqualTo("The request could not be processed.");
    }

    @RestController
    static class OtherController {
        @PostMapping("/test/other")
        public void submit(@Valid @RequestBody OtherSubmission submission) {
            // Intentionally empty because this test endpoint only exercises request validation.
        }

        @GetMapping("/test/missing")
        public void missing() {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "PRIVATE missing record");
        }

        @GetMapping("/test/conflict")
        public void conflict() {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "PRIVATE conflict details");
        }

        @GetMapping("/test/failure")
        public void failure() {
            throw new IllegalStateException("PRIVATE internal error");
        }
    }

    record OtherSubmission(@NotBlank String name) {}
}
