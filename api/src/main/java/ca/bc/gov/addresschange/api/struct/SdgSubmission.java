package ca.bc.gov.addresschange.api.struct;

import com.fasterxml.jackson.annotation.JsonProperty;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import java.time.Instant;
import java.time.LocalDate;

@Schema(description = "Submission envelope supplied by the Single Digital Gateway.")
public record SdgSubmission(
        @Schema(
                        description =
                                "Identifier assigned to the submission by SDG; distinct from our request UUID.",
                        example = "sdg-submission-12345")
                @NotBlank
                String submissionId,
        @Schema(
                        description =
                                "Submission version supplied by SDG.",
                        example = "1.0")
                @NotBlank
                String submissionVersion,
        @Schema(
                        description =
                                "Time SDG submitted the form, expressed as an ISO-8601 instant.",
                        example = "2026-09-28T20:15:00Z")
                @NotNull
                Instant submittedAt,
        @Schema(
                        description =
                                "SDG form journey.",
                        example = "RESIDENTIAL")
                @NotBlank
                String journey,
        @Schema(description = "Address change fields submitted through the SDG form.")
                @NotNull
                @Valid
                Data data) {
    @Schema(
            name = "SdgSubmissionData",
            description =
                    "Address change form fields.")
    public record Data(
            @Schema(
                            description =
                                    "Whether the citizen requests notification to ICBC.",
                            example = "true")
                    @JsonProperty("notify_icbc")
                    @NotNull
                    Boolean notifyIcbc,
            @Schema(
                            description =
                                    "Whether the citizen requests notification to MSP.",
                            example = "true")
                    @JsonProperty("notify_msp")
                    @NotNull
                    Boolean notifyMsp,
            @Schema(
                            description =
                                    "Previous country code.",
                            example = "CA")
                    @JsonProperty("old_country")
                    @NotBlank
                    String oldCountry,
            @Schema(
                            description =
                                    "Previous primary address line.",
                            example = "1234 Example St")
                    @JsonProperty("old_address_line_one")
                    @NotBlank
                    String oldAddressLineOne,
            @Schema(
                            description =
                                    "Previous additional address line (optional).",
                            example = "Unit 2")
                    @JsonProperty("old_address_line_two")
                    String oldAddressLineTwo,
            @Schema(
                            description =
                                    "Previous city or locality.",
                            example = "Victoria")
                    @JsonProperty("old_city")
                    @NotBlank
                    String oldCity,
            @Schema(
                            description =
                                    "Previous province or region.",
                            example = "BC")
                    @JsonProperty("old_province")
                    @NotBlank
                    String oldProvince,
            @Schema(
                            description =
                                    "Previous postal code.",
                            example = "V8V 1X4")
                    @JsonProperty("old_postal_code")
                    @NotBlank
                    String oldPostalCode,
            @Schema(
                            description = "New country code.",
                            example = "CA")
                    @JsonProperty("new_country")
                    @NotBlank
                    String newCountry,
            @Schema(
                            description =
                                    "New primary address line.",
                            example = "1234 Example St")
                    @JsonProperty("new_address_line_one")
                    @NotBlank
                    String newAddressLineOne,
            @Schema(
                            description =
                                    "New additional address line (optional).",
                            example = "Unit 2")
                    @JsonProperty("new_address_line_two")
                    String newAddressLineTwo,
            @Schema(
                            description =
                                    "New city or locality.",
                            example = "Victoria")
                    @JsonProperty("new_city")
                    @NotBlank
                    String newCity,
            @Schema(
                            description =
                                    "New province or region.",
                            example = "BC")
                    @JsonProperty("new_province")
                    @NotBlank
                    String newProvince,
            @Schema(
                            description = "New postal code.",
                            example = "V8V 1X4")
                    @JsonProperty("new_postal_code")
                    @NotBlank
                    String newPostalCode,
            @Schema(
                            description =
                                    "SDG billing-address selection.",
                            example = "yes")
                    @JsonProperty("is_billing_address_same")
                    String isBillingAddressSame,
            @Schema(
                            description = "Given name of the person submitting the address change.",
                            example = "John")
                    @JsonProperty("first_name")
                    @NotBlank
                    String firstName,
            @Schema(
                            description =
                                    "First middle initial.",
                            example = "A")
                    @JsonProperty("first_middle_name_initial")
                    String firstMiddleNameInitial,
            @Schema(
                            description =
                                    "Second middle initial.",
                            example = "B")
                    @JsonProperty("second_middle_name_initial")
                    String secondMiddleNameInitial,
            @Schema(
                            description =
                                    "Family name of the person submitting the address change.",
                            example = "Doe")
                    @JsonProperty("last_name")
                    @NotBlank
                    String lastName,
            @Schema(
                            description = "Date of birth in ISO calendar-date format.",
                            example = "1900-01-01")
                    @JsonProperty("date_of_birth")
                    @NotNull
                    LocalDate dateOfBirth,
            @Schema(
                            description = "Contact email address, preserved as supplied.",
                            example = "john@doe.localhost")
                    @JsonProperty("email_address")
                    String emailAddress,
            @Schema(
                            description =
                                    "Daytime contact number.",
                            example = "+1 (250) 867-5309")
                    @JsonProperty("daytime_phone")
                    String daytimePhone,
            @Schema(
                            description = "Move date used as the normalized effective date.",
                            example = "2027-01-01")
                    @JsonProperty("date_of_move")
                    @NotNull
                    LocalDate dateOfMove,
            @Schema(
                            description =
                                    "ICBC driver licence number.",
                            example = "00123456")
                    @JsonProperty("drivers_license_number")
                    String driversLicenseNumber,
            @Schema(
                            description =
                                    "Optional height in centimetres as a positive whole-number string.",
                            example = "180")
                    @Pattern(regexp = "[1-9][0-9]{0,8}")
                    String height,
            @Schema(
                            description =
                                    "Optional weight in kilograms as a positive whole-number string.",
                            example = "100")
                    @Pattern(regexp = "[1-9][0-9]{0,8}")
                    String weight,
            @Schema(
                            description = "Optional ICBC security keyword supplied by the citizen.",
                            example = "Synthetic test keyword")
                    @JsonProperty("security_keyword")
                    String securityKeyword,
            @Schema(
                            description =
                                    "MSP personal health number.",
                            example = "0012345678")
                    String phn) {}
}
