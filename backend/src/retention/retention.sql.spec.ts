import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { Prisma } from '../../generated/prisma/client.js'
import type { S3Transport } from '../flat-file/s3.transport'
import type { PrismaService } from '../prisma.service'
import { RetentionService } from './retention.service'

const DAY_MS = 86_400_000
const now = new Date('2026-11-17T10:00:00Z')
const daysAgo = (days: number) => new Date(now.getTime() - days * DAY_MS)

describe('RetentionService against the real schema', () => {
  let pg: PGlite
  let service: RetentionService

  const bind = (run: (text: string, values: unknown[]) => Promise<any>) => ({
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = Prisma.sql(strings, ...values)
      return (await run(sql.text, sql.values)).rows
    },
    $executeRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = Prisma.sql(strings, ...values)
      return (await run(sql.text, sql.values)).affectedRows
    },
  })

  beforeAll(async () => {
    pg = new PGlite()
    const migrations = resolve('..', 'migrations/sql')
    for (const file of readdirSync(migrations)
      .filter((name) => name.endsWith('.sql'))
      .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))) {
      await pg.exec(readFileSync(resolve(migrations, file), 'utf8'))
    }
    const prisma = {
      ...bind((text, values) => pg.query(text, values)),
      withAdvisoryLock: (_key: string, work: () => Promise<unknown>) => work(),
      $transaction: (callback: (tx: unknown) => Promise<unknown>) =>
        pg.transaction((tx) => callback(bind((text, values) => tx.query(text, values)))),
    }
    service = new RetentionService(
      prisma as unknown as PrismaService,
      { delete: vi.fn() } as unknown as S3Transport,
    )
  }, 30000)

  afterAll(async () => {
    await pg?.close()
  })

  const pendingUnbatched = async (requestId: string) =>
    (
      await pg.query(
        `SELECT 1 FROM address_change.processing_operation
         WHERE request_id = $1 AND status = 'PENDING' AND batch_id IS NULL`,
        [requestId],
      )
    ).rows

  it('preserves a newer request and its personal data when purging a shared batch', async () => {
    await pg.exec(`
      INSERT INTO address_change.partner_system (partner_code, partner_name, delivery_mode)
      VALUES ('RETENTION-SHARED', 'Shared batch test', 'FLAT_FILE');
      INSERT INTO address_change.address_change_request
        (owner_sub, idempotency_key, raw_payload_encrypted, effective_date, created_by, updated_by, created_at)
      VALUES
        ('expired-shared', 'key', '\\x01'::bytea, '2026-11-01', 'test', 'test', '2026-10-01'),
        ('newer-shared', 'key', '\\x02'::bytea, '2026-11-01', 'test', 'test', '2026-11-07');
      INSERT INTO address_change.request_person (request_id, first_name, last_name, date_of_birth)
      SELECT request_id, 'Test', 'Resident', '1990-01-01'
      FROM address_change.address_change_request WHERE owner_sub = 'newer-shared';
      INSERT INTO address_change.submitted_address
        (request_id, old_address_line_one, old_city, old_province, old_postal_code, old_country,
         new_address_line_one, new_city, new_province, new_postal_code, new_country, is_mailing_address_same)
      SELECT request_id, '1 Test St', 'Victoria', 'BC', 'V8V 1X4', 'CA',
             '2 Test St', 'Victoria', 'BC', 'V8V 1X4', 'CA', true
      FROM address_change.address_change_request WHERE owner_sub = 'newer-shared';
      INSERT INTO address_change.flat_file_batch (partner_id, file_date, created_at)
      SELECT partner_id, '2026-11-08', '2026-11-08'
      FROM address_change.partner_system WHERE partner_code = 'RETENTION-SHARED';
      INSERT INTO address_change.processing_operation (request_id, partner_id, batch_id, delivery_mode)
      SELECT r.request_id, b.partner_id, b.batch_id, 'FLAT_FILE'
      FROM address_change.address_change_request r
      CROSS JOIN address_change.flat_file_batch b
      JOIN address_change.partner_system p USING (partner_id)
      WHERE r.owner_sub IN ('expired-shared', 'newer-shared') AND p.partner_code = 'RETENTION-SHARED';
    `)

    const result = await service.purgeExpired(now)

    expect(result.deletedRequests).toBe(1)
    expect(result.deletedBatches).toBe(1)
    const survivors = await pg.query(`
      SELECT r.owner_sub, p.first_name, a.new_address_line_one, o.status, o.batch_id
      FROM address_change.address_change_request r
      JOIN address_change.request_person p USING (request_id)
      JOIN address_change.submitted_address a USING (request_id)
      JOIN address_change.processing_operation o USING (request_id)
      WHERE r.owner_sub IN ('expired-shared', 'newer-shared')`)
    expect(survivors.rows).toEqual([
      {
        owner_sub: 'newer-shared',
        first_name: 'Test',
        new_address_line_one: '2 Test St',
        status: 'PENDING',
        batch_id: null,
      },
    ])

    const rebatched = await pg.query(`
      WITH next_batch AS (
        INSERT INTO address_change.flat_file_batch (partner_id, file_date)
        SELECT partner_id, '2026-11-17' FROM address_change.partner_system
        WHERE partner_code = 'RETENTION-SHARED' RETURNING batch_id, partner_id
      )
      UPDATE address_change.processing_operation o SET batch_id = b.batch_id
      FROM next_batch b WHERE o.partner_id = b.partner_id
        AND o.status = 'PENDING' AND o.batch_id IS NULL
      RETURNING o.operation_id`)
    expect(rebatched.rows).toHaveLength(1)

    await pg.exec(`DELETE FROM address_change.address_change_request WHERE owner_sub = 'newer-shared';
      DELETE FROM address_change.flat_file_batch WHERE partner_id IN (
        SELECT partner_id FROM address_change.partner_system WHERE partner_code = 'RETENTION-SHARED');`)
  })

  it('does not let an expired request be re-batched to renew its protection across runs', async () => {
    const insert = async (sql: string, values: unknown[]) =>
      (await pg.query<{ id: string }>(sql, values)).rows[0]!.id
    const partner = (code: string) =>
      insert(
        `INSERT INTO address_change.partner_system (partner_code, partner_name, delivery_mode)
         VALUES ($1, $1, 'FLAT_FILE') RETURNING partner_id AS id`,
        [code],
      )
    const batch = (partnerId: string, createdAt: Date) =>
      insert(
        `INSERT INTO address_change.flat_file_batch (partner_id, file_date, status, created_at)
         VALUES ($1, $2::date, 'READY', $2) RETURNING batch_id AS id`,
        [partnerId, createdAt],
      )
    const first = await partner('RETENTION-A')
    const second = await partner('RETENTION-B')
    const requestId = await insert(
      `INSERT INTO address_change.address_change_request
         (owner_sub, idempotency_key, raw_payload_encrypted, effective_date, created_by, updated_by, created_at)
       VALUES ('resident', 'key', '\\x01'::bytea, '2026-10-01', 'test', 'test', $1)
       RETURNING request_id AS id`,
      [daysAgo(40)],
    )
    const oldBatch = await batch(first, daysAgo(35))
    const recentBatch = await batch(second, daysAgo(1))
    for (const [partnerId, batchId] of [
      [first, oldBatch],
      [second, recentBatch],
    ]) {
      await pg.query(
        `INSERT INTO address_change.processing_operation (request_id, partner_id, batch_id, delivery_mode)
         VALUES ($1, $2, $3, 'FLAT_FILE')`,
        [requestId, partnerId, batchId],
      )
    }

    // Run 1: the recent batch is protected, so the expired request survives.
    await service.purgeExpired(now)
    const operations = await pg.query<{ batch_id: string | null; status: string }>(
      `SELECT batch_id, status FROM address_change.processing_operation
       WHERE request_id = $1 ORDER BY status`,
      [requestId],
    )
    expect(operations.rows).toEqual([
      { batch_id: null, status: 'CANCELLED' },
      { batch_id: recentBatch, status: 'PENDING' },
    ])
    expect(await pendingUnbatched(requestId)).toEqual([])

    // Run 2: once the protection window passes, the request and remaining batch are removed.
    await service.purgeExpired(new Date(now.getTime() + 8 * DAY_MS))
    const remaining = await pg.query(
      `SELECT (SELECT count(*) FROM address_change.address_change_request)::int AS requests,
              (SELECT count(*) FROM address_change.flat_file_batch)::int AS batches`,
    )
    expect(remaining.rows).toEqual([{ requests: 0, batches: 0 }])
  })
})
