package ca.bc.gov.addresschange.api.struct.v1;

import java.time.LocalDate;
import java.util.UUID;
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
public class NormalizedAddressChange {
    private UUID requestId;
    private String submissionId;
    private LocalDate effectiveDate;
    private Person person;
    private Address oldAddress;
    private Address newAddress;
    private LegacyIdentifiers legacyIdentifiers;
    private NotificationIntent notificationIntent;
}
