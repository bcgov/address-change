FROM artifacts.developer.gov.bc.ca/docker-remote/maven:3.9.11-eclipse-temurin-25 AS build
WORKDIR /workspace/app

COPY api/pom.xml .
COPY api/src src
RUN mvn clean package -DskipTests
RUN mkdir -p target/dependency && (cd target/dependency; jar -xf ../*.jar)

FROM artifacts.developer.gov.bc.ca/docker-remote/eclipse-temurin:25-jre-alpine
RUN addgroup -S spring \
    && adduser -S spring -G spring \
    && mkdir -p /logs \
    && chown -R spring:spring /logs \
    && chmod 755 /logs
USER spring:spring
VOLUME /tmp
ARG DEPENDENCY=/workspace/app/target/dependency
COPY --from=build ${DEPENDENCY}/BOOT-INF/lib /app/lib
COPY --from=build ${DEPENDENCY}/META-INF /app/META-INF
COPY --from=build ${DEPENDENCY}/BOOT-INF/classes /app
ENTRYPOINT [ \
    "java", \
    "-XX:MaxRAMPercentage=75.0", \
    "-XX:+ExitOnOutOfMemoryError", \
    "-cp", \
    "app:app/lib/*", \
    "ca.bc.gov.addresschange.api.AddressChangeApiApplication" \
]
