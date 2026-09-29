package ca.bc.gov.addresschange.api.service;

import ca.bc.gov.addresschange.api.struct.NormalizedAddressChange;
import ca.bc.gov.addresschange.api.struct.NormalizedAddressChange.*;
import ca.bc.gov.addresschange.api.struct.SdgSubmission;
import java.util.Objects;
import java.util.UUID;
import java.util.stream.Stream;
import org.springframework.stereotype.Service;

@Service
public class SdgNormalizationService {
    public NormalizedAddressChange normalize(UUID requestId, SdgSubmission submission) {
        Objects.requireNonNull(requestId, "requestId");
        var data = submission.data();
        var initials =
                Stream.of(data.firstMiddleNameInitial(), data.secondMiddleNameInitial())
                        .filter(Objects::nonNull)
                        .map(String::strip)
                        .filter(value -> !value.isEmpty())
                        .toList();
        return new NormalizedAddressChange(
                requestId,
                submission.submissionId(),
                data.dateOfMove(),
                new Person(
                        data.firstName(),
                        initials,
                        data.lastName(),
                        data.dateOfBirth(),
                        data.emailAddress(),
                        data.daytimePhone()),
                new Address(
                        data.oldCountry(),
                        data.oldAddressLineOne(),
                        data.oldAddressLineTwo(),
                        data.oldCity(),
                        data.oldProvince(),
                        data.oldPostalCode(),
                        AddressSource.SDG_FORM),
                new Address(
                        data.newCountry(),
                        data.newAddressLineOne(),
                        data.newAddressLineTwo(),
                        data.newCity(),
                        data.newProvince(),
                        data.newPostalCode(),
                        AddressSource.USER_CONFIRMED),
                new LegacyIdentifiers(
                        new Icbc(
                                data.driversLicenseNumber(),
                                integerOrNull(data.height()),
                                integerOrNull(data.weight()),
                                data.securityKeyword()),
                        new Msp(data.phn())),
                new NotificationIntent(data.notifyIcbc(), data.notifyMsp()));
    }

    private Integer integerOrNull(String value) {
        return value == null ? null : Integer.valueOf(value);
    }
}
