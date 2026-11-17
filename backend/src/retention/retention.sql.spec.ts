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
