# Address Change PostgreSQL schema

`sql/V1__address_change_schema.sql` is the initial application migration for the
repository's PostgreSQL 18 database. It targets schema `address_change`, works
with Patroni, requires no extensions or superuser, and follows the existing
Flyway deployment layout. This single initial migration creates eight tables
and a `request_status` view, including the shared `status_type` lookup, stored
request status, status-based active-request uniqueness, common audit fields and
transfer-based batch completion. Consolidation was agreed before initial application.
Once applied to a retained database, do not edit V1; use new versioned migrations.
It is a fresh-install migration, not an upgrade of the older experimental
`address-change-service/db` schema in a different local directory.

## Run

Use the Patroni **primary/write endpoint**, with the project's migration role.
The database must already exist with UTF8 encoding. Database creation, Patroni,
backups, TLS, database roles and grants remain platform provisioning concerns.

Normal deployment: use the existing Flyway migration pipeline. Locally:

```sh
docker compose up --build migrations
```

For a manually managed fresh database, from the repository root:

```sh
psql "$DATABASE_URL" -X --set=ON_ERROR_STOP=1 --single-transaction \
  --file=migrations/sql/V1__address_change_schema.sql
psql "$DATABASE_URL" -X --set=ON_ERROR_STOP=1 \
  --file=migrations/tests/schema_smoke.sql
```

Use your approved credential mechanism; do not commit a real connection string.
The smoke test rolls back all its data. The migration intentionally fails on
existing tables: it never drops or silently replaces an existing schema.
Choose Flyway or manual installation for a given database, not both. Manually
running V1 does not create Flyway history; subsequent adoption requires an
explicit baseline after verifying the schema.

The `Schema Tests` GitHub workflow uses an isolated PostgreSQL 18.6 service to
test a fresh install. The rollback-only smoke
test covers status-domain validation, stored summary synchronization, failed
requests retaining the owner slot, transfer completion, audit timestamps and the
existing Unicode/integrity checks.

## Unicode and First Nations characters

Both database and client encoding are UTF8; the migration refuses a non-UTF8
database. Names, initials and addresses use `text`, preserving accented letters,
glottal stops, superscripts, syllabics and combining characters. Do not apply
ASCII-only validation, uppercase conversion, accent removal or automatic
transliteration to these values. Initials are not limited to one byte or one
code point. Opaque subject IDs and idempotency keys use deterministic `C`
collation for exact comparisons; they are never normalized as human names.

UTF8 storage does not define language-specific sorting or guarantee a browser
font can display every character. Confirm fonts and any search/sort requirements
in the frontend. Encrypt the UTF-8 bytes of payloads; encryption envelopes must
include the key version, nonce and authentication tag needed for decryption.
`bytea` is only a ciphertext container: PostgreSQL does not encrypt those fields
automatically. Keep encryption keys outside the database.

Legacy files have their own partner-specified encoding and byte-width rules.
Validate those separately. Never silently replace unsupported characters with
`?`, strip combining marks or truncate UTF-8 bytes. Preserve the original input
and agree an exception/transliteration process with each partner.

## Intake and idempotency

In one short transaction, insert the request, person, submitted address and one
PENDING operation per selected partner. A deferred trigger rejects incomplete
intake at commit. `owner_sub` comes from the validated token, under a single
configured issuer. No access or refresh tokens belong in any table.

Check `(owner_sub, idempotency_key)` first. For a repeated key, compare the
validated incoming business data with the decrypted original; return the
existing result only if they match, otherwise return a conflict. On simultaneous
submissions a unique violation is possible: roll back and look up the existing
request before choosing the appropriate response. Never compare ciphertext for
payload equality, since encryption can use different nonces.

Request status is stored in `address_change_request.status`. Operation changes
lock their parent request and synchronize that status in the same transaction.
The summary view reads the stored status and adds operation counts; it is not a
second source of status truth. Direct updates to an inconsistent summary are rejected.
There is no `closed_at` in the final schema. A partial unique index on `owner_sub`
applies where status is not COMPLETED or CLOSED. FAILED stays active for retries.
All operations SUCCEEDED means COMPLETED; all terminal with at least one CANCELLED
means CLOSED. Otherwise priority is PROCESSING, PARTIALLY_COMPLETED,
PENDING_CONFIRMATION (unknown outcome), PENDING_DELIVERY, then FAILED.
An intake with no operations yet starts SUBMITTED; complete intake is still
required at commit. New requests can be submitted after completion/closure.
Terminal requests and terminal operation statuses cannot reopen. Always show
individual partner results alongside the overall status.

Use short READ COMMITTED transactions, and never hold the parent lock over a
network call. Do not grant the application DELETE on operations: only the purge
role should delete request aggregates. Application code must keep person/address
snapshots and completed attempts immutable. The database does not implement all
business transition rules or authorization: the API must check owner_sub for
every status read and retry, and restrict cancellation/partner administration.

## API retry

### Status vocabulary

`status_type` uses `(status_category, status_code)` as its primary key. Categories
are REQUEST, OPERATION, ATTEMPT and BATCH. Generated category columns on the consuming
tables ensure that, for example, a BATCH-only code cannot be used for an attempt.
Clients write `status`; do not write generated category columns. The frontend
does not choose request status. Batches have only one status pair, not a separate
SFTP status.

Add codes or change display labels through new Flyway migrations. Keep referenced
codes stable; retire them with `active = false` rather than deleting history.
The flag is administrative: the API must enforce any policy against new use of
inactive codes. Foreign keys only enforce that the code exists in its category.

Adding a lookup row does not implement new workflow behaviour. Review the request
summary calculation, terminal-state triggers, attempt completion checks, partial indexes
and API retry/transition logic before introducing a new operational status.
Adding a new terminal request status also requires changing the active-owner index.
Delivery mode remains constrained text (FLAT_FILE or REALTIME); the team's lookup
decision concerns statuses, not delivery-mode configuration.

### Audit fields

All eight tables have `created_at`, `created_by`, `updated_at` and `updated_by`.
A shared `set_updated_at()` trigger runs on every table update, after guard
triggers. Guards do not assign timestamps.
For future writes, the API/worker must supply a trusted actor/job ID in the
by-fields (never accept these fields directly from a browser). Defaults on newly
by-fields identify only the database role. The timestamp trigger does not
infer the human actor or replace `updated_by`.

### Retry processing

Claim an eligible operation atomically (`UPDATE ... SET status = 'IN_PROGRESS' WHERE status = 'FAILED'
RETURNING operation_id`); proceed only if one row is returned. In the same
transaction, insert a STARTED attempt with the next attempt number and encrypted
outbound payload. Commit, call SDX using the current request's token in memory,
then update attempt and operation outcomes in a new short transaction. A unique
index permits only one STARTED attempt per operation.

Retry eligibility depends on the error, not just FAILED. A timeout is TIMED_OUT
on the attempt and UNKNOWN on the operation. Reconcile or use a partner-supported
idempotent retry; a local uniqueness constraint cannot prevent a remote duplicate.
Use a stable operation_id as the external idempotency key if the partner contract
supports it. Recovery must inspect old STARTED attempts; the DDL is not a recovery
scheduler. Never reset stale work and resend blindly.

## Temporary flat-file delivery

ICBC and HEALTH start with FLAT_FILE defaults. Copy the selected mode into each
operation at intake. Later changes to partner defaults do not reroute queued work.
Each batch belongs to one partner; a composite FK prevents assigning another
partner's operation to it. Assign and freeze membership before generating the
file, and exclude already-assigned work from subsequent nightly selection.

The agreed MVP keeps one `batch_id` on each operation. It does not preserve past
membership if you overwrite that field. Add a batch-operation history table
before implementing regeneration/reassignment. Retry transfer of the same
immutable file using its existing batch record, filename and checksum, in line
with the partner's duplicate-handling contract. API attempt rows are not a file
transfer-attempt history.

Successful file transfer is the completion boundary: the worker sets batch SENT,
and a database trigger marks its non-cancelled outstanding operations SUCCEEDED
and updates their request summaries in the same transaction. No partner
acknowledgement or proof that records were applied is required. The UI should say
"Sent to partner", not "Partner records updated". Batch states are BUILDING,
READY, TRANSFERRING, SENT, FAILED and UNKNOWN. SENT is terminal success; the worker
must not reset or regenerate a sent batch. Freeze membership before transfer:
do not attach new operations after marking SENT. Unknown transfer outcomes require
reconciliation before retry. `record_count` counts detail records, excluding
headers/trailers. Full files belong in protected storage, with metadata here.

### Diagram alignment / review decisions

- Status lookup tables replace status enums/check lists, as agreed with the team.
- Stored request status and a status-based owner index replace the earlier derived-only
  status and `closed_at` design.
- All diagram audit fields are present; generic update timestamps address review feedback.
- One batch status replaces SFTP/acknowledgement tracking; SENT completes delivery.
- Existing billing-address fields are retained because the diagram's
  `is_billing_address_same = false` needs somewhere to store that address.
- Existing `height_cm` / `weight_kg` names keep units explicit. Error codes are text;
  the diagram's Invalid PHN / Address Rejected are examples, not a complete list.
- Checksum, generated/transferred timestamps and existing integrity rules remain
  useful implementation details beyond the conceptual diagram. The single batch
  membership, partner-matching FK and one-started-attempt rule remain unchanged.
- All agreed changes are created directly by the single initial V1 migration;
  no intermediate schema, upgrade fixture or data-conversion migration is needed.

## Retention and permissions

The daily purge uses original request `created_at`, including incomplete requests
under the agreed strict 30-day rule. This cascades to person, address, operation
and attempt data. Example for the purge job (destructive; preview count first):

```sql
SELECT count(*) FROM address_change.address_change_request
WHERE created_at < now() - interval '30 days';

DELETE FROM address_change.address_change_request
WHERE created_at < now() - interval '30 days';
```

Deleting the request removes idempotency and ownership history too; deduplication
is limited to the retained window. The job must separately delete generated file
objects and later remove unreferenced batch metadata according to policy. A batch
can reference multiple requests of different ages, so do not delete a shared file
just because one request expires. Define file retention and backup retention with
the platform team. There is no automatic purge scheduler in this migration.

Have the platform provision a migration owner, a restricted API role and a purge
role. Only grant the API access needed for the workflow; never grant public read
access. Encrypted fields do not protect the other person/address columns: those
remain personal information requiring restricted access and platform encryption.

Prisma models are not generated by this SQL. After application, introspect with
the repository's Prisma configuration and review the mappings; Flyway remains
the migration authority. Partial indexes, triggers and the derived view are SQL
features and must not be replaced through `prisma db push`.
