# Address Change PostgreSQL schema

`sql/V1__address_change_schema.sql` is the single initial Flyway migration for
PostgreSQL 18 / Patroni. It creates schema `address_change`, eight tables, status
and partner seed data, indexes, constraints and a read-only `request_status` view.
It requires a UTF8 database, no extensions and no superuser.

Workflow belongs to the API/saga. This migration creates no application triggers
or stored workflow functions. It does not implement the service or saga itself.
Once applied to a retained database, do not edit V1; use new versioned migrations.
It is a fresh-install migration, not an upgrade of another experimental schema.

## Run and verify

Use the Patroni primary/write endpoint and the project's migration role. Use the
existing Flyway pipeline for deployment. Local deployment uses:

```sh
docker compose up --build migrations
```

For an isolated fresh database, from the repository root:

```sh
psql "$DATABASE_URL" -X --set=ON_ERROR_STOP=1 --single-transaction \
  --file=migrations/sql/V1__address_change_schema.sql
psql "$DATABASE_URL" -X --set=ON_ERROR_STOP=1 \
  --file=migrations/tests/schema_smoke.sql
```

Use an approved credential mechanism. Choose Flyway or manual installation for a
database, not both. A manual install does not create Flyway history; adopting
Flyway afterward requires an explicit, verified baseline.

The Schema Tests workflow uses disposable PostgreSQL 18.6. Its rollback-only
smoke test checks Unicode, foreign keys, status categories, idempotency, one
active request, partner/attempt uniqueness, attempt timestamp checks, purge
cascades and the absence of application triggers. Explicit updates in that test
demonstrate the schema contract; they do not validate a service implementation.
Application concurrency and workflow tests must accompany the future service.

## Database and service responsibilities

| Database enforces | API/saga must implement |
| --- | --- |
| Primary/foreign keys, NOT NULL and row-level checks | Complete intake and business validation |
| One non-terminal request per owner | Status transitions, cancellation and immutable submitted data |
| Unique resident/idempotency key | Compare repeated-key payloads and authorize ownership |
| Unique request/partner operation | Choose partners and snapshot delivery mode |
| Matching batch/operation partners | Batch assignment, membership freezing and transfer handling |
| Unique attempt number; one STARTED attempt per operation | Retry claims, remote idempotency and recovery |
| Status exists within the correct category | Request summary calculation and inactive-status policy |
| Audit column defaults on INSERT | Set updated_at / updated_by on every UPDATE |

The database does not reject a known status merely because its transition is
invalid, synchronize parent summaries, reject sent-batch assignment, or prevent
reopening terminal work. These are service rules to implement and test before
production use. Restrict direct writes to the workflow tables accordingly.

## Intake, ownership and statuses

The API inserts request, person, residential address and one PENDING operation
per selected partner in one transaction. It sets request status explicitly.
`owner_sub` is taken from a validated access token under the single-configured-
issuer contract. Check ownership on every status read and retry.
Never persist access or refresh tokens.

For an existing `(owner_sub, idempotency_key)`, compare validated business data
with the decrypted original. Matching data returns the existing request;
different data returns a conflict. Handle a concurrent unique violation by
rolling back and looking up the existing request. Ciphertext equality is not
payload equality because encryption may use different nonces.

The partial unique owner index applies where request status is not COMPLETED
or CLOSED. FAILED remains active for retry. The service must write the correct
request status in the same transaction as operation outcomes; otherwise the
active-owner rule follows an incorrect summary. There is no `closed_at`.

Recommended summary priority, to implement in service code:

1. No operations yet: SUBMITTED (intake must still be complete before commit).
2. All operations SUCCEEDED: COMPLETED.
3. All operations SUCCEEDED/CANCELLED, with a cancellation: CLOSED.
4. Any IN_PROGRESS: PROCESSING.
5. Any SUCCEEDED with outstanding work: PARTIALLY_COMPLETED.
6. Any UNKNOWN: PENDING_CONFIRMATION.
7. Any PENDING: PENDING_DELIVERY.
8. Otherwise: FAILED.

The view reads the stored status and adds operation/success counts. It performs
no writes. Return individual partner outcomes alongside the summary.

`status_type` uses composite key `(status_category, status_code)`. REQUEST,
OPERATION, ATTEMPT and BATCH categories are generated constants on referencing
tables; callers supply only `status`. Add vocabulary through migrations and
implement its behaviour in code. Keep referenced codes stable; labels can change
and obsolete codes can be inactive. A new terminal request status also requires
changing the active-owner index. Delivery mode remains constrained text:
FLAT_FILE or REALTIME.

## Transactions, retries and batches

Use short READ COMMITTED transactions. The service must use one lock order:
batch rows when involved, then request rows ordered by request_id, then operation
rows ordered by operation_id, then attempt rows as needed. Real-time work uses
request then operation. Acquire these locks before mutation; every workflow
writer must follow the same order. Batch membership discovery must occur while
holding the batch lock. Never hold these locks across SDX calls, generation
of files or SFTP transfer. Retry database transactions on deadlock/serialization
failure according to policy; do not repeat an external side effect blindly.

Retry claims lock the request and operation, verify eligibility, set the
operation IN_PROGRESS, insert the next STARTED attempt and update the request
summary/audits, then commit. Call SDX with the current delegated token in memory.
Record attempt, operation and request outcomes in a new short transaction.
A timeout is TIMED_OUT on the attempt and UNKNOWN on the operation. Reconcile
uncertain outcomes or use partner-supported idempotency before resending.
Recovery must inspect stale STARTED attempts.

ICBC and HEALTH start with FLAT_FILE defaults. Snapshot the selected mode onto
operations so later configuration changes cannot reroute queued work.
Batch assignment locks the batch, checks BUILDING, locks affected requests and
operations, and assigns eligible operations. Freeze membership atomically by
moving the batch out of BUILDING before generating the file. READY and all later
states are closed to new membership. Generate from that frozen membership, then
store filename, checksum, generated_at and detail record_count. Header/trailer
lines are excluded from record_count.

For upload, claim the frozen generated file as TRANSFERRING and commit before
network I/O. After confirmed transfer, a service transaction locks the batch,
its requests and operations in the agreed order; writes SENT, transferred_at,
operation SUCCEEDED and recalculated request summaries; and updates audit fields.
SENT is terminal transport success. No acknowledgement or proof of partner
application is required. User wording should say "Sent to partner". FAILED or
UNKNOWN transfer outcomes must not accept new members; reconcile uncertain
delivery before retry. Retry the same immutable file under the partner's
duplicate-handling contract.

There is one batch_id per operation. Replacing it loses prior membership;
add a linking history before implementing reassignment/regeneration. Attempt
rows track API calls, not file-transfer attempts. Store full files separately
in protected storage.

## Audits, personal information and Unicode

All tables have created_at/by and updated_at/by. Timestamp defaults apply on
INSERT only. The API/job must explicitly set updated_at and trusted updated_by
on every UPDATE. Database-role defaults on by-fields identify that role, not
the resident. Do not accept audit actors directly from the browser.

Names and residential addresses use UTF8 text, preserving First Nations letters,
syllabics and combining characters. Do not apply ASCII-only validation, byte
truncation or silent transliteration. Opaque subjects/idempotency keys use C
collation for exact comparison. Confirm frontend fonts and partner-specific
legacy file encodings separately; agree how unsupported file characters are
handled without changing the original input.

Payload/identifier bytea columns hold application-provided ciphertext envelopes
with key version, nonce and authentication tag. They do not encrypt themselves.
Keep keys outside the database; never include tokens or headers in payload
snapshots. Other person/address columns remain personal information requiring
restricted access and platform encryption. Only old/new residential addresses
are stored; billing fields and the same-address indicator are excluded.

## Retention and provisioning

The daily purge uses original request created_at under the strict 30-day rule,
including incomplete work. Preview the count before deleting:

```sql
SELECT count(*) FROM address_change.address_change_request
WHERE created_at < now() - interval '30 days';

DELETE FROM address_change.address_change_request
WHERE created_at < now() - interval '30 days';
```

Request deletion cascades to person, address, operation and attempt rows.
Idempotency history is limited to retained data. Separately remove generated
file objects and unreferenced batch metadata under the retention policy;
a file may contain requests of different ages. Define backup retention with
the platform team. This migration installs no purge scheduler.

Database creation, Patroni, backups, TLS, roles and grants remain provisioning
concerns. Use a migration owner, restricted service role and separate purge role.
No public read access; the service should not delete request aggregates.

Prisma models/service methods are not generated by this migration. Introspect
and review mappings after application; Flyway remains the migration authority.
Preserve the SQL partial indexes, constraints and view rather than replacing
the schema through `prisma db push`.
