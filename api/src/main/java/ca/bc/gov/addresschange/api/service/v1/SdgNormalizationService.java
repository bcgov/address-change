package ca.bc.gov.addresschange.api.service.v1;

import ca.bc.gov.addresschange.api.struct.v1.Address;
import ca.bc.gov.addresschange.api.struct.v1.AddressSource;
import ca.bc.gov.addresschange.api.struct.v1.IcbcLegacyIdentifiers;
import ca.bc.gov.addresschange.api.struct.v1.LegacyIdentifiers;
import ca.bc.gov.addresschange.api.struct.v1.MspLegacyIdentifiers;
import ca.bc.gov.addresschange.api.struct.v1.NormalizedAddressChange;
import ca.bc.gov.addresschange.api.struct.v1.NotificationIntent;
import ca.bc.gov.addresschange.api.struct.v1.Person;
import ca.bc.gov.addresschange.api.struct.v1.SdgSubmission;
import java.util.Objects;
import java.util.UUID;
import java.util.stream.Stream;
import org.springframework.stereotype.Service;

@Service
public class SdgNormalizationService {
    public NormalizedAddressChange normalize(UUID requestId, SdgSubmission submission) {
        Objects.requireNonNull(requestId, "requestId");
        var data = submission.getData();
        var initials =
                Stream.of(data.getFirstMiddleNameInitial(), data.getSecondMiddleNameInitial())
                        .filter(Objects::nonNull)
                        .map(String::strip)
                        .filter(value -> !value.isEmpty())
                        .toList();
        return new NormalizedAddressChange(
                requestId,
                submission.getSubmissionId(),
                data.getDateOfMove(),
                new Person(
                        data.getFirstName(),
                        initials,
                        data.getLastName(),
                        data.getDateOfBirth(),
                        data.getEmailAddress(),
                        data.getDaytimePhone()),
                new Address(
                        data.getOldCountry(),
                        data.getOldAddressLineOne(),
                        data.getOldAddressLineTwo(),
                        data.getOldCity(),
                        data.getOldProvince(),
                        data.getOldPostalCode(),
                        AddressSource.SDG_FORM),
                new Address(
                        data.getNewCountry(),
                        data.getNewAddressLineOne(),
                        data.getNewAddressLineTwo(),
                        data.getNewCity(),
                        data.getNewProvince(),
                        data.getNewPostalCode(),
                        AddressSource.USER_CONFIRMED),
                new LegacyIdentifiers(
                        new IcbcLegacyIdentifiers(
                                data.getDriversLicenseNumber(),
                                integerOrNull(data.getHeight()),
                                integerOrNull(data.getWeight()),
                                data.getSecurityKeyword()),
                        new MspLegacyIdentifiers(data.getPhn())),
                new NotificationIntent(data.getNotifyIcbc(), data.getNotifyMsp()));
    }

    private Integer integerOrNull(String value) {
        return value == null ? null : Integer.valueOf(value);
    }
}
