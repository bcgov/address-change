package ca.bc.gov.addresschange.api.controller;

import ca.bc.gov.addresschange.api.service.SdgNormalizationService;
import ca.bc.gov.addresschange.api.struct.SdgSubmission;
import jakarta.validation.Valid;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class SdgWebhookController {
    private final SdgNormalizationService normalizer;

    public SdgWebhookController(SdgNormalizationService normalizer) {
        this.normalizer = normalizer;
    }

    @PostMapping(
            path = "/sdg/webhook",
            consumes = MediaType.APPLICATION_JSON_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE)
    @ResponseStatus(HttpStatus.ACCEPTED)
    public Acknowledgement receive(@Valid @RequestBody SdgSubmission submission) {
        var requestId = UUID.randomUUID();
        var normalized = normalizer.normalize(requestId, submission);
        return new Acknowledgement(normalized.requestId());
    }

    public record Acknowledgement(UUID requestId) {}
}
