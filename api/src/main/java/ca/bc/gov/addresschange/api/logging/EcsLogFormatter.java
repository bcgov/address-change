package ca.bc.gov.addresschange.api.logging;

import ch.qos.logback.classic.spi.ILoggingEvent;
import java.util.LinkedHashMap;
import org.jspecify.annotations.NullMarked;
import org.springframework.boot.logging.structured.StructuredLogFormatter;
import org.springframework.core.env.Environment;
import tools.jackson.databind.json.JsonMapper;

/** Flat ECS fields matching the LOC-7077 SIEM examples, including typed event values. */
@NullMarked
public class EcsLogFormatter implements StructuredLogFormatter<ILoggingEvent> {
    private final JsonMapper mapper = JsonMapper.builder().build();
    private final Environment environment;

    public EcsLogFormatter(Environment environment) {
        this.environment = environment;
    }

    @Override
    public String format(ILoggingEvent event) {
        var fields = new LinkedHashMap<String, Object>();
        fields.put("@timestamp", event.getInstant().toString());
        fields.put("log.level", event.getLevel().toString());
        fields.put("log.logger", event.getLoggerName());
        fields.put("process.thread.name", event.getThreadName());
        fields.put("message", event.getFormattedMessage());
        var name = environment.getProperty("spring.application.name", "address-change-api");
        fields.put("service.name", name);
        fields.put(
                "service.id", environment.getProperty("logging.structured.ecs.service.id", name));
        fields.put(
                "service.version",
                environment.getProperty(
                        "logging.structured.ecs.service.version", "0.0.1-SNAPSHOT"));
        fields.put(
                "service.environment",
                environment.getProperty("logging.structured.ecs.service.environment", "LOCAL"));
        var labels = new LinkedHashMap<String, Object>();
        event.getMDCPropertyMap()
                .forEach(
                        (key, value) -> {
                            if (key.startsWith("labels.")) labels.put(key.substring(7), value);
                            else if (key.equals("http.request.id") || key.equals("client.id"))
                                fields.put(key, value);
                        });
        if (!labels.isEmpty()) fields.put("labels", labels);
        if (event.getKeyValuePairs() != null) {
            event.getKeyValuePairs().forEach(pair -> fields.put(pair.key, pair.value));
        }
        // Exception messages and stack traces can include submitted personal data.
        if (event.getThrowableProxy() != null) {
            fields.put("error.type", event.getThrowableProxy().getClassName());
        }
        fields.put("ecs.version", "9.4.0");
        return mapper.writeValueAsString(fields) + "\n";
    }
}
