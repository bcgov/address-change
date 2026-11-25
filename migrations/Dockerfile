FROM flyway/flyway:13-alpine

# Application migrations are added to sql/ as the database model is developed.
COPY ./sql /flyway/sql
RUN apk add --no-cache jq && adduser -D app
COPY vault-entrypoint.sh /flyway/vault-entrypoint.sh
USER app

ENTRYPOINT ["/bin/sh", "/flyway/vault-entrypoint.sh"]
CMD ["info", "migrate", "info"]
