package ca.bc.gov.addresschange.api.controller;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice(assignableTypes = SdgWebhookController.class)
public class SdgWebhookExceptionHandler {
    @ExceptionHandler({
        MethodArgumentNotValidException.class,
        HttpMessageNotReadableException.class
    })
    public ProblemDetail invalidSubmission(Exception exception) {
        // Never echo rejected form values or parser messages containing personal information.
        return ProblemDetail.forStatusAndDetail(
                HttpStatus.BAD_REQUEST,
                "Invalid SDG submission. Check required fields, dates, notification flags, and numeric measurements.");
    }
}
