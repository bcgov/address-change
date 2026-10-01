package ca.bc.gov.addresschange.api.struct.v1;

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
public class IcbcLegacyIdentifiers {
    private String driversLicenceNumber;
    private Integer heightCm;
    private Integer weightKg;
    private String securityKeyword;
}
