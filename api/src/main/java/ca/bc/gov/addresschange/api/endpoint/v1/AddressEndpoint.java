package ca.bc.gov.addresschange.api.endpoint.v1;

import ca.bc.gov.addresschange.api.constants.v1.URL;
import ca.bc.gov.addresschange.api.struct.v1.AddressChangeAcknowledgement;
import ca.bc.gov.addresschange.api.struct.v1.SdgSubmission;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;

@RequestMapping(URL.SDG)
@Tag(name = "Address", description = "Address change submissions")
public interface AddressEndpoint {
    @PostMapping(
            path = URL.ADDRESS,
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
                        description = "Submission normalized and acknowledged with a request ID.",
                        content =
                                @Content(
                                        mediaType = MediaType.APPLICATION_JSON_VALUE,
                                        schema =
                                                @Schema(
                                                        implementation =
                                                                AddressChangeAcknowledgement
                                                                        .class))),
                @ApiResponse(
                        responseCode = "400",
                        description = "The JSON submission is malformed or fails field validation.",
                        content =
                                @Content(
                                        mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                                        schema = @Schema(implementation = ProblemDetail.class))),
                @ApiResponse(
                        responseCode = "415",
                        description = "The request content type is not application/json.",
                        content =
                                @Content(
                                        mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                                        schema = @Schema(implementation = ProblemDetail.class))),
                @ApiResponse(
                        responseCode = "500",
                        description = "An unexpected error occurred.",
                        content =
                                @Content(
                                        mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                                        schema = @Schema(implementation = ProblemDetail.class)))
            })
    AddressChangeAcknowledgement acceptSdgSubmission(
            @io.swagger.v3.oas.annotations.parameters.RequestBody(
                            required = true,
                            description = "SDG submission envelope and address change form fields.",
                            content =
                                    @Content(
                                            mediaType = MediaType.APPLICATION_JSON_VALUE,
                                            schema = @Schema(implementation = SdgSubmission.class)))
                    @Valid
                    @RequestBody
                    SdgSubmission submission);
}
