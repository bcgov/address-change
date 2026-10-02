package ca.bc.gov.addresschange.api.struct.v1;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.time.Instant;
import lombok.AllArgsConstructor;
import lombok.EqualsAndHashCode;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@EqualsAndHashCode
@Schema(description = "Submission envelope supplied by the Single Digital Gateway.")
public class SdgSubmission {

    @Schema(
            description =
                    "Identifier assigned to the submission by SDG; distinct from our request UUID.",
            example = "sdg-submission-12345")
    @NotBlank
    private String submissionId;

    @Schema(description = "Submission version supplied by SDG.", example = "1.0")
    @NotBlank
    private String submissionVersion;

    @Schema(
            description = "Time SDG submitted the form, expressed as an ISO-8601 instant.",
            example = "2026-09-28T20:15:00Z")
    @NotNull
    private Instant submittedAt;

    @Schema(description = "SDG form journey.", example = "RESIDENTIAL")
    @NotBlank
    private String journey;

    @Schema(description = "Address change fields submitted through the SDG form.")
    @NotNull
    @Valid
    private SdgSubmissionData data;
}
