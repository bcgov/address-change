# Address Change request intake

`POST /api/v1/address-change` accepts the resident-confirmed form and saves it in one database
transaction. It returns `202 { "requestId": "<uuid>" }` only after commit. This means **saved for
processing**, not delivered to ICBC/Health.

## What is saved

| Table                    | Initial record                                                                                     |
| ------------------------ | -------------------------------------------------------------------------------------------------- |
| `address_change_request` | Owner from the verified token, idempotency key, effective date, encrypted body, `SUBMITTED` status |
| `request_person`         | Submitted personal details; driver licence, PHN and security keyword encrypted individually        |
| `submitted_address`      | Old/new residential snapshots and the separate mailing address when selected                       |
| `processing_operation`   | One `PENDING` operation per selected active partner, using its server-configured delivery mode     |

`notifyIcbc` selects `ICBC`; `notifyMsp` selects `HEALTH`. At least one must be selected. Neither
delivery mode nor owner identity may be supplied by the client. No batch, attempt, partner call,
token exchange, event publication or SFTP delivery is created by this endpoint. Those are separate
work. The request remains active until a later workflow completes or closes it.

The existing frontend property `isBillingAddressSame` actually represents its mailing-address
checkbox. For compatibility, the API maps it to `is_mailing_address_same`; this does not introduce
billing data. When false, `mailingAddress` is required. When true, the new residential address is
also the mailing address and separate mailing columns remain null. A coordinated frontend and
contract rename can follow later.

Flyway remains the schema authority. The existing V1 is unchanged. Parameterized Prisma SQL uses its
tables directly; this endpoint does not run migrations or create a separate Prisma-managed schema.
Audit values are set from the verified owner subject. Submitted strings are preserved as UTF-8
without transliteration. Body name/address fields are resident-confirmed snapshots, not
independently verified identity assertions.

## Authentication configuration

For local development, copy `backend/.env.local.example` to `backend/.env.local` and fill in the
local values. `.env.local` is gitignored and must never be committed. In deployed environments,
inject these values as environment variables through the platform's approved configuration and
secret-management mechanism. There are no implicit development defaults or authentication bypass.

| Variable                | Development value / requirement                                                                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `OIDC_ISSUER`           | `https://dev.loginproxy.gov.bc.ca/auth/realms/standard`                                                                                                      |
| `OIDC_AUDIENCE`         | `address-change-bc-6667`                                                                                                                                     |
| `OIDC_JWKS_URI`         | `https://dev.loginproxy.gov.bc.ca/auth/realms/standard/protocol/openid-connect/certs`                                                                        |
| `OIDC_SUBMISSION_SCOPE` | One approved submission scope. `address-change-bc-6667` is present in the supplied dev sample, but its authorization meaning requires confirmation with SSO. |

The issuer and JWKS URL were checked against the public development
[discovery document](https://dev.loginproxy.gov.bc.ca/auth/realms/standard/.well-known/openid-configuration).
Configure TEST/PROD separately. Do not mix subjects from different issuers in this database: the
current schema deliberately assumes one configured issuer.

The browser sends the **signed access token**, not decoded claims or an ID token:

```http
POST /api/v1/address-change
Authorization: Bearer <access-token>
Content-Type: application/json
```

The verifier checks the RS256 signature using cached/rotating public keys, exact issuer, audience,
expiry, required subject/issued-at claims, access-token type and configured scope. It accepts the
Keycloak payload type `Bearer` or JWT header type `at+jwt`. RS256 is an explicit allowlist, not
inferred from untrusted token headers; confirm the client uses it before integration. Issuer and
JWKS must use HTTPS. Missing configuration/key-service failure returns 503; invalid/expired tokens
return 401; missing permission returns 403. Local JWT verification does not check immediate
logout/revocation; any requirement for introspection needs a separate design decision.

Only verified `sub` becomes `owner_sub`. No bearer/refresh tokens, authorization headers, or full
claims are written to the database. The browser can use claims for prefill, but must submit the
final form object below. No real resident claims or tokens are stored in test fixtures.

## Encryption configuration

| Variable                           | Requirement                                                                          |
| ---------------------------------- | ------------------------------------------------------------------------------------ |
| `ADDRESS_CHANGE_ENCRYPTION_KEY_ID` | ID of the active encryption key, e.g. `v1`                                           |
| `ADDRESS_CHANGE_ENCRYPTION_KEYS`   | JSON object mapping key IDs to base64-encoded, cryptographically random 32-byte keys |

Inject keys using the approved secret-management mechanism, never source control, frontend
configuration or logs. There is no default key or plaintext fallback. AES-256-GCM envelopes include
version, key ID, random nonce, authentication tag and ciphertext; authenticated context binds each
envelope to its request and field. Retain old keys while retained requests/backups still need them.
Encryption or decryption failure returns 503 and prevents partial saves.

Names, dates of birth, contact details and address columns remain normal database columns, as in the
approved schema. Application encryption here does not replace database/storage encryption, TLS,
access controls or the planned retention/purge job. SQL parameter and raw database-error logging are
disabled to avoid exposing submitted information. Retention cleanup is not implemented in this
change.

## Example body (synthetic data)

```json
{
  "idempotencyKey": "155616bc-754e-4695-b67b-11670567925e",
  "effectiveDate": "2027-01-01",
  "isBillingAddressSame": true,
  "person": {
    "firstName": "Test",
    "lastName": "Resident",
    "dateOfBirth": "1990-02-03",
    "emailAddress": "test@example.test"
  },
  "oldAddress": {
    "country": "CA",
    "addressLineOne": "1 Test Street",
    "locality": "Victoria",
    "region": "BC",
    "postalCode": "V8V 1X4"
  },
  "newAddress": {
    "country": "CA",
    "addressLineOne": "2 Test Street",
    "addressLineTwo": "Unit 5",
    "locality": "Vancouver",
    "region": "BC",
    "postalCode": "V5K 0A1"
  },
  "notificationIntent": { "notifyIcbc": true, "notifyMsp": true }
}
```

The contract also accepts the existing optional legacy fields (middle initials, phone, driver
licence, height/weight, PHN, security keyword). Partner-specific file validation is not yet
implemented; acceptance is not a promise that this minimal example is sufficient for a legacy file.
Unknown fields are rejected.

## Duplicate submissions and failures

- Generate an idempotency key once per confirmed submission; reuse the same key and body after a
  network error. Do not generate a fresh key just to retry.
- Same owner + same key + same parsed body returns the original request ID, regardless of JSON
  property order, while the request is retained.
- Same key with changed data returns 409. Null and omitted optional fields remain distinct; a retry
  should preserve the original body.
- Another key for the same owner returns 409 while an active request exists. Only `COMPLETED` and
  `CLOSED` release this restriction; `FAILED` remains active.
- Intake takes a transaction-scoped advisory lock per owner. Existing unique constraints also
  protect against duplicates. Only aborted database transactions are retried, at most three
  attempts; no partner side effects occur in this step.
- All related inserts roll back together on failure. Keep the same key if a timeout leaves the
  client unsure whether the transaction committed.
- Idempotency lasts only as long as the stored request; the future purge policy must account for
  that boundary.

## Local verification

With the existing backend database environment configured and Flyway already applied, also supply
the authentication/encryption settings above. Use a fresh signed development access token from
login. Never paste tokens into committed request files or terminal commands that retain history.

```sh
cp .env.local.example .env.local
# edit .env.local, then run:
npm ci
npm run build
npm run lint
npx vitest run src/address-change src/auth
npm run start:dev
```

The intake HTTP tests execute the actual V1 migration in an isolated in-memory PGlite PostgreSQL
engine. They test real SQL/constraints and rollback but replace the Prisma transport and token
verifier. Separate verifier tests check actual cryptographic signatures with synthetic keys/tokens.
These tests never connect to a configured development database.

Before deployment, verify the full Prisma/PG18/Patroni connection and concurrent submissions across
multiple API instances in an approved disposable environment. Also verify approved SSO scope/signing
algorithm, secrets injection, database privileges, and UI error handling. This change does not
modify deployment manifests or connect to real partner systems.
