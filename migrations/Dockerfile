FROM flyway/flyway:13-alpine

# Application migrations are added to sql/ as the database model is developed.
COPY ./sql /flyway/sql
RUN adduser -D app
USER app

CMD ["info", "migrate", "info"]
