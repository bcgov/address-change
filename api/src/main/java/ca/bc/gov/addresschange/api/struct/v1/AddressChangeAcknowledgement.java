package ca.bc.gov.addresschange.api.struct.v1;

import io.swagger.v3.oas.annotations.media.Schema;
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
@Schema(description = "Acknowledgement identifying this request within the Address Change service.")
public class AddressChangeAcknowledgement {

    @Schema(
            description =
                    "UUID assigned by the Address Change service when the webhook receives the request.",
            example = "7c825573-3df5-4e63-b376-ef7a4057369d",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private UUID requestId;
}
