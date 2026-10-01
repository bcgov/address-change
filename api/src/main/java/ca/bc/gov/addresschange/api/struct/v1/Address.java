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
public class Address {
    private String country;
    private String addressLineOne;
    private String addressLineTwo;
    private String locality;
    private String region;
    private String postalCode;
    private AddressSource source;
}
