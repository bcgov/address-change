package ca.bc.gov.addresschange.api.controller;

import ca.bc.gov.addresschange.api.service.SdgNormalizationService;
import ca.bc.gov.addresschange.api.struct.SdgSubmission;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Tag(name = "SDG", description = "Single Digital Gateway")
public class SdgWebhookController {
    private final SdgNormalizationService normalizer;

    public SdgWebhookController(SdgNormalizationService normalizer) {
        this.normalizer = normalizer;
    }

    @PostMapping(
            path = "/sdg/webhook",
            consumes = MediaType.APPLICATION_JSON_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE)
    @ResponseStatus(HttpStatus.ACCEPTED)
    @Operation(
            operationId = "acceptSdgSubmission",
            summary = "Accept an address change submission from SDG",
            description =
                    "Validates and normalizes a Single Digital Gateway form submission and returns our request UUID. ",
            responses = {
                @ApiResponse(
                        responseCode = "202",
                        description =
                                "Submission normalized and acknowledged with a request ID.",
                        content =
                                @Content(
                                        mediaType = MediaType.APPLICATION_JSON_VALUE,
                                        schema = @Schema(implementation = Acknowledgement.class))),
                @ApiResponse(
                        responseCode = "400",
                        description =
                                "The JSON submission is malformed or fails field validation.",
                        content =
                                @Content(
                                        mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                                        schema = @Schema(implementation = ProblemDetail.class))),
                @ApiResponse(
                        responseCode = "415",
                        description = "The request content type is not application/json.",
                        content = @Content)
            })
    public Acknowledgement receive(
            @io.swagger.v3.oas.annotations.parameters.RequestBody(
                            required = true,
                            description = "SDG submission envelope and address change form fields.",
                            content =
                                    @Content(
                                            mediaType = MediaType.APPLICATION_JSON_VALUE,
                                            schema = @Schema(implementation = SdgSubmission.class)))
                    @Valid
                    @RequestBody
                    SdgSubmission submission) {
        var requestId = UUID.randomUUID();
        var normalized = normalizer.normalize(requestId, submission);
        return new Acknowledgement(normalized.requestId());
    }

    @Schema(
            description =
                    "Acknowledgement identifying this request within the Address Change service.")
    public record Acknowledgement(
            @Schema(
                            description =
                                    "UUID assigned by the Address Change service when the webhook receives the request.",
                            example = "7c825573-3df5-4e63-b376-ef7a4057369d",
                            requiredMode = Schema.RequiredMode.REQUIRED)
                    UUID requestId) {}
}
