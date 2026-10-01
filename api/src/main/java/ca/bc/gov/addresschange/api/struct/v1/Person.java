package ca.bc.gov.addresschange.api.struct.v1;

import java.time.LocalDate;
import java.util.List;
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
public class Person {
    private String firstName;
    private List<String> middleNameInitials;
    private String lastName;
    private LocalDate dateOfBirth;
    private String email;
    private String phone;
}
