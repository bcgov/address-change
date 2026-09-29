package ca.bc.gov.addresschange.api.struct;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public record NormalizedAddressChange(
        UUID requestId,
        String submissionId,
        LocalDate effectiveDate,
        Person person,
        Address oldAddress,
        Address newAddress,
        LegacyIdentifiers legacyIdentifiers,
        NotificationIntent notificationIntent) {
    public record Person(
            String firstName,
            List<String> middleNameInitials,
            String lastName,
            LocalDate dateOfBirth,
            String email,
            String phone) {}

    public record Address(
            String country,
            String addressLineOne,
            String addressLineTwo,
            String locality,
            String region,
            String postalCode,
            AddressSource source) {}

    public enum AddressSource {
        SDG_FORM,
        USER_CONFIRMED
    }

    public record LegacyIdentifiers(Icbc icbc, Msp msp) {}

    public record Icbc(
            String driversLicenceNumber,
            Integer heightCm,
            Integer weightKg,
            String securityKeyword) {}

    public record Msp(String phn) {}

    public record NotificationIntent(boolean notifyIcbc, boolean notifyMsp) {}
}
