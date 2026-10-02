package ca.bc.gov.addresschange.api.controller.v1;

import ca.bc.gov.addresschange.api.endpoint.v1.AddressEndpoint;
import ca.bc.gov.addresschange.api.service.v1.SdgNormalizationService;
import ca.bc.gov.addresschange.api.struct.v1.AddressChangeAcknowledgement;
import ca.bc.gov.addresschange.api.struct.v1.SdgSubmission;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
public class AddressController implements AddressEndpoint {
    private final SdgNormalizationService normalizer;

    @Override
    public AddressChangeAcknowledgement acceptSdgSubmission(SdgSubmission submission) {
        var requestId = UUID.randomUUID();
        var normalized = normalizer.normalize(requestId, submission);
        return new AddressChangeAcknowledgement(normalized.getRequestId());
    }
}
