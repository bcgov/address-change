package ca.bc.gov.addresschange.api.struct.v1;

import com.fasterxml.jackson.annotation.JsonProperty;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import java.time.LocalDate;
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
@Schema(name = "SdgSubmissionData", description = "Address change form fields.")
public class SdgSubmissionData {

    @Schema(description = "Whether the citizen requests notification to ICBC.", example = "true")
    @JsonProperty("notify_icbc")
    @NotNull
    private Boolean notifyIcbc;

    @Schema(description = "Whether the citizen requests notification to MSP.", example = "true")
    @JsonProperty("notify_msp")
    @NotNull
    private Boolean notifyMsp;

    @Schema(description = "Previous country code.", example = "CA")
    @JsonProperty("old_country")
    @NotBlank
    private String oldCountry;

    @Schema(description = "Previous primary address line.", example = "1234 Example St")
    @JsonProperty("old_address_line_one")
    @NotBlank
    private String oldAddressLineOne;

    @Schema(description = "Previous additional address line (optional).", example = "Unit 2")
    @JsonProperty("old_address_line_two")
    private String oldAddressLineTwo;

    @Schema(description = "Previous city or locality.", example = "Victoria")
    @JsonProperty("old_city")
    @NotBlank
    private String oldCity;

    @Schema(description = "Previous province or region.", example = "BC")
    @JsonProperty("old_province")
    @NotBlank
    private String oldProvince;

    @Schema(description = "Previous postal code.", example = "V8V 1X4")
    @JsonProperty("old_postal_code")
    @NotBlank
    private String oldPostalCode;

    @Schema(description = "New country code.", example = "CA")
    @JsonProperty("new_country")
    @NotBlank
    private String newCountry;

    @Schema(description = "New primary address line.", example = "1234 Example St")
    @JsonProperty("new_address_line_one")
    @NotBlank
    private String newAddressLineOne;

    @Schema(description = "New additional address line (optional).", example = "Unit 2")
    @JsonProperty("new_address_line_two")
    private String newAddressLineTwo;

    @Schema(description = "New city or locality.", example = "Victoria")
    @JsonProperty("new_city")
    @NotBlank
    private String newCity;

    @Schema(description = "New province or region.", example = "BC")
    @JsonProperty("new_province")
    @NotBlank
    private String newProvince;

    @Schema(description = "New postal code.", example = "V8V 1X4")
    @JsonProperty("new_postal_code")
    @NotBlank
    private String newPostalCode;

    @Schema(description = "SDG billing-address selection.", example = "yes")
    @JsonProperty("is_billing_address_same")
    private String isBillingAddressSame;

    @Schema(
            description = "Given name of the person submitting the address change.",
            example = "John")
    @JsonProperty("first_name")
    @NotBlank
    private String firstName;

    @Schema(description = "First middle initial.", example = "A")
    @JsonProperty("first_middle_name_initial")
    private String firstMiddleNameInitial;

    @Schema(description = "Second middle initial.", example = "B")
    @JsonProperty("second_middle_name_initial")
    private String secondMiddleNameInitial;

    @Schema(
            description = "Family name of the person submitting the address change.",
            example = "Doe")
    @JsonProperty("last_name")
    @NotBlank
    private String lastName;

    @Schema(description = "Date of birth in ISO calendar-date format.", example = "1900-01-01")
    @JsonProperty("date_of_birth")
    @NotNull
    private LocalDate dateOfBirth;

    @Schema(
            description = "Contact email address, preserved as supplied.",
            example = "john@doe.localhost")
    @JsonProperty("email_address")
    private String emailAddress;

    @Schema(description = "Daytime contact number.", example = "+1 (250) 867-5309")
    @JsonProperty("daytime_phone")
    private String daytimePhone;

    @Schema(
            description = "Move date used as the normalized effective date.",
            example = "2027-01-01")
    @JsonProperty("date_of_move")
    @NotNull
    private LocalDate dateOfMove;

    @Schema(description = "ICBC driver licence number.", example = "00123456")
    @JsonProperty("drivers_license_number")
    private String driversLicenseNumber;

    @Schema(
            description = "Optional height in centimetres as a positive whole-number string.",
            example = "180")
    @Pattern(regexp = "[1-9]\\d{0,8}")
    private String height;

    @Schema(
            description = "Optional weight in kilograms as a positive whole-number string.",
            example = "100")
    @Pattern(regexp = "[1-9]\\d{0,8}")
    private String weight;

    @Schema(
            description = "Optional ICBC security keyword supplied by the citizen.",
            example = "Synthetic test keyword")
    @JsonProperty("security_keyword")
    private String securityKeyword;

    @Schema(description = "MSP personal health number.", example = "0012345678")
    private String phn;
}
