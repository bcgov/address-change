package ca.bc.gov.addresschange.api.struct;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import java.time.Instant;
import java.time.LocalDate;

public record SdgSubmission(
        @NotBlank String submissionId,
        @NotBlank String submissionVersion,
        @NotNull Instant submittedAt,
        @NotBlank String journey,
        @NotNull @Valid Data data) {
    public record Data(
            @JsonProperty("notify_icbc") @NotNull Boolean notifyIcbc,
            @JsonProperty("notify_msp") @NotNull Boolean notifyMsp,
            @JsonProperty("old_country") @NotBlank String oldCountry,
            @JsonProperty("old_address_line_one") @NotBlank String oldAddressLineOne,
            @JsonProperty("old_address_line_two") String oldAddressLineTwo,
            @JsonProperty("old_city") @NotBlank String oldCity,
            @JsonProperty("old_province") @NotBlank String oldProvince,
            @JsonProperty("old_postal_code") @NotBlank String oldPostalCode,
            @JsonProperty("new_country") @NotBlank String newCountry,
            @JsonProperty("new_address_line_one") @NotBlank String newAddressLineOne,
            @JsonProperty("new_address_line_two") String newAddressLineTwo,
            @JsonProperty("new_city") @NotBlank String newCity,
            @JsonProperty("new_province") @NotBlank String newProvince,
            @JsonProperty("new_postal_code") @NotBlank String newPostalCode,
            @JsonProperty("is_billing_address_same") String isBillingAddressSame,
            @JsonProperty("first_name") @NotBlank String firstName,
            @JsonProperty("first_middle_name_initial") String firstMiddleNameInitial,
            @JsonProperty("second_middle_name_initial") String secondMiddleNameInitial,
            @JsonProperty("last_name") @NotBlank String lastName,
            @JsonProperty("date_of_birth") @NotNull LocalDate dateOfBirth,
            @JsonProperty("email_address") String emailAddress,
            @JsonProperty("daytime_phone") String daytimePhone,
            @JsonProperty("date_of_move") @NotNull LocalDate dateOfMove,
            @JsonProperty("drivers_license_number") String driversLicenseNumber,
            @Pattern(regexp = "[1-9][0-9]{0,8}") String height,
            @Pattern(regexp = "[1-9][0-9]{0,8}") String weight,
            @JsonProperty("security_keyword") String securityKeyword,
            String phn) {}
}
