package ca.bc.gov.addresschange.api.exception;

import org.jspecify.annotations.NullMarked;
import org.jspecify.annotations.Nullable;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

@RestControllerAdvice
@NullMarked
public class RestExceptionHandler extends ResponseEntityExceptionHandler {
    @Override
    protected @Nullable ResponseEntity<Object> handleExceptionInternal(
            Exception exception,
            @Nullable Object body,
            HttpHeaders headers,
            HttpStatusCode status,
            WebRequest request) {
        // Never echo rejected values or exception messages containing personal information.
        var detail =
                switch (status.value()) {
                    case 400 -> "Invalid request. Check the request body and required fields.";
                    case 404 -> "The requested resource was not found.";
                    case 405 -> "The HTTP method is not supported for this resource.";
                    case 415 -> "The request content type is not supported.";
                    default ->
                            status.is5xxServerError()
                                    ? "An unexpected error occurred."
                                    : "The request could not be processed.";
                };
        return super.handleExceptionInternal(
                exception,
                ProblemDetail.forStatusAndDetail(status, detail),
                headers,
                status,
                request);
    }

    @ExceptionHandler(Exception.class)
    public @Nullable ResponseEntity<Object> unexpectedException(
            Exception exception, WebRequest request) {
        // Log the exception type only; messages and stack traces can contain submitted data.
        LoggerFactory.getLogger(RestExceptionHandler.class)
                .atError()
                .addKeyValue("error.type", exception.getClass().getName())
                .log("Unexpected API exception");
        return handleExceptionInternal(
                exception, null, new HttpHeaders(), HttpStatus.INTERNAL_SERVER_ERROR, request);
    }
}
