package ca.bc.gov.addresschange.api;

import static org.assertj.core.api.Assertions.assertThat;

import ca.bc.gov.addresschange.api.service.v1.SdgNormalizationService;
import ca.bc.gov.addresschange.api.struct.v1.SdgSubmission;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class SdgWebhookTest {
    @LocalServerPort private int port;
    @Autowired private JsonMapper mapper;
    @Autowired private SdgNormalizationService normalizer;

    private String example() throws Exception {
        try (var stream = getClass().getResourceAsStream("/sdg-submission.json")) {
            return new String(stream.readAllBytes(), StandardCharsets.UTF_8);
        }
    }

    private HttpResponse<String> post(String body) throws Exception {
        var request =
                HttpRequest.newBuilder(
                                URI.create("http://localhost:" + port + "/api/v1/sdg/address"))
                        .header("Content-Type", "application/json")
                        .POST(HttpRequest.BodyPublishers.ofString(body))
                        .build();
        return HttpClient.newHttpClient().send(request, HttpResponse.BodyHandlers.ofString());
    }

    @Test
    void normalizesTheProvidedExample() throws Exception {
        var requestId = UUID.randomUUID();
        var submission = mapper.readValue(example(), SdgSubmission.class);
        var normalized = normalizer.normalize(requestId, submission);
        assertThat(normalized.getRequestId()).isEqualTo(requestId);
        assertThat(normalizer.normalize(requestId, submission)).isEqualTo(normalized);
        var actual = (ObjectNode) mapper.valueToTree(normalized);
        actual.remove("requestId");
        assertThat(actual)
                .isEqualTo(
                        mapper.readTree(
                                """
                {"submissionId":"sdg-submission-12345","effectiveDate":"2027-01-01",
                "person":{"firstName":"John","middleNameInitials":["A","B"],"lastName":"Doe",
                "dateOfBirth":"1900-01-01","email":"john@doe.localhost","phone":"+1 (250) 867-5309"},
                "oldAddress":{"country":"CA","addressLineOne":"1234 Ekaf St","addressLineTwo":null,
                "locality":"Golden","region":"BC","postalCode":"V0A 0A0","source":"SDG_FORM"},
                "newAddress":{"country":"CA","addressLineOne":"9876 Ekaf St","addressLineTwo":null,
                "locality":"Sooke","region":"BC","postalCode":"V9Z 0A0","source":"USER_CONFIRMED"},
                "legacyIdentifiers":{"icbc":{"driversLicenceNumber":"12345678","heightCm":180,
                "weightKg":100,"securityKeyword":"Lorem ipsum dolor sit amet..."},"msp":{"phn":"1234567890"}},
                "notificationIntent":{"notifyIcbc":true,"notifyMsp":true}}
                """));
    }

    @Test
    void acknowledgesWithUniqueRequestId() throws Exception {
        var first = post(example());
        var second = post(example());
        assertThat(first.statusCode()).isEqualTo(202);
        assertThat(second.statusCode()).isEqualTo(202);
        var response = mapper.readTree(first.body());
        assertThat(response.size()).isEqualTo(1);
        var id = UUID.fromString(response.get("requestId").asString());
        assertThat(mapper.readTree(second.body()).get("requestId").asString())
                .isNotEqualTo(id.toString());
    }

    @Test
    void preservesFalseFlagsAndLeadingZeroIdentifiersAndOmitsBlankInitials() throws Exception {
        var payload = (ObjectNode) mapper.readTree(example());
        var data = (ObjectNode) payload.get("data");
        data.put("notify_icbc", false);
        data.put("notify_msp", false);
        data.put("drivers_license_number", "00123456");
        data.put("phn", "0012345678");
        data.put("first_middle_name_initial", " ");
        data.putNull("second_middle_name_initial");
        data.putNull("height");
        data.remove("weight");
        var normalized =
                normalizer.normalize(
                        UUID.randomUUID(), mapper.treeToValue(payload, SdgSubmission.class));
        assertThat(normalized.getPerson().getMiddleNameInitials()).isEmpty();
        assertThat(normalized.getNotificationIntent().isNotifyIcbc()).isFalse();
        assertThat(normalized.getNotificationIntent().isNotifyMsp()).isFalse();
        assertThat(normalized.getLegacyIdentifiers().getIcbc().getDriversLicenceNumber())
                .isEqualTo("00123456");
        assertThat(normalized.getLegacyIdentifiers().getMsp().getPhn()).isEqualTo("0012345678");
        assertThat(normalized.getLegacyIdentifiers().getIcbc().getHeightCm()).isNull();
        assertThat(normalized.getLegacyIdentifiers().getIcbc().getWeightKg()).isNull();
        assertThat(post(payload.toString()).statusCode()).isEqualTo(202);
    }

    @Test
    void rejectsInvalidFieldsWithoutExposingValuesInResponse() throws Exception {
        for (String field : new String[] {"height", "weight", "date_of_birth", "date_of_move"}) {
            var payload = (ObjectNode) mapper.readTree(example());
            ((ObjectNode) payload.get("data")).put(field, "PRIVATE_INVALID_VALUE");
            var response = post(payload.toString());
            assertThat(response.statusCode()).isEqualTo(400);
            assertThat(response.body())
                    .doesNotContain("PRIVATE_INVALID_VALUE", "John", "1234567890");
        }
        assertThat(post("{}").statusCode()).isEqualTo(400);
        assertThat(post("{broken").statusCode()).isEqualTo(400);
        var payload = (ObjectNode) mapper.readTree(example());
        ((ObjectNode) payload.get("data")).remove("notify_icbc");
        assertThat(post(payload.toString()).statusCode()).isEqualTo(400);
        payload.putNull("data");
        assertThat(post(payload.toString()).statusCode()).isEqualTo(400);
    }
}
