import { FLAT_FILE_DATA_LOCK } from '../flat-file/flat-file.service'
import type { S3Transport } from '../flat-file/s3.transport'
import type { PrismaService } from '../prisma.service'
import { RetentionService, retentionDays } from './retention.service'

const now = new Date('2026-11-17T10:00:00Z')

type BatchRow = {
  batch_id: string
  s3_object_key: string | null
  s3_attempt_count?: number
  file_name?: string | null
  is_protected?: boolean
}

function setup(batches: BatchRow[]) {
  const tx = { $executeRaw: vi.fn().mockResolvedValue(2) }
  const prisma = {
    withAdvisoryLock: vi.fn((_key: string, work: () => unknown) => work()),
    $queryRaw: vi.fn().mockResolvedValue(
      batches.map((batch) => ({
        s3_attempt_count: batch.s3_object_key ? 1 : 0,
        partner_code: 'ICBC',
        file_name: 'a.txt',
        is_protected: false,
        ...batch,
      })),
    ),
    $transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
  }
  const s3 = { delete: vi.fn().mockResolvedValue(undefined) }
  const service = new RetentionService(
    prisma as unknown as PrismaService,
    s3 as unknown as S3Transport,
  )
  return { service, prisma, tx, s3 }
}

// Tagged-template calls receive (strings, ...values); return only the bound values.
const values = (call: unknown[]) => call.slice(1)

describe('RetentionService', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('defaults to 30 days and requires at least 7', () => {
    vi.stubEnv('DATA_RETENTION_DAYS', '')
    expect(retentionDays()).toBe(30)
    vi.stubEnv('DATA_RETENTION_DAYS', '7')
    expect(retentionDays()).toBe(7)
    vi.stubEnv('DATA_RETENTION_DAYS', '6')
    expect(() => retentionDays()).toThrow('at least 7')
    vi.stubEnv('DATA_RETENTION_DAYS', 'abc')
    expect(() => retentionDays()).toThrow('at least 7')
  })

  it('deletes S3 copies by default, then requests and batches older than the cutoff', async () => {
    const { service, prisma, tx, s3 } = setup([
      { batch_id: 'b-1', s3_object_key: 'flat-files/ICBC/a.txt' },
      { batch_id: 'b-2', s3_object_key: null },
    ])

    const result = await service.purgeExpired(now)

    const cutoff = new Date('2026-10-18T10:00:00Z')
    expect(prisma.withAdvisoryLock).toHaveBeenCalledWith(FLAT_FILE_DATA_LOCK, expect.any(Function))
    expect(values(prisma.$queryRaw.mock.calls[0]!)).toEqual([
      new Date('2026-11-10T10:00:00Z'),
      cutoff,
      cutoff,
    ])
    expect(s3.delete).toHaveBeenCalledExactlyOnceWith('flat-files/ICBC/a.txt')
    const [detach, deleteRequests, deleteBatches] = tx.$executeRaw.mock.calls
    expect(values(detach!)).toEqual([now, 'retention-job', ['b-1', 'b-2']])
    expect(values(deleteRequests!)).toEqual([cutoff, []])
    expect(values(deleteBatches!)).toEqual([['b-1', 'b-2']])
    expect(result).toEqual({
      cutoff,
      deletedRequests: 2,
      deletedBatches: 2,
      deletedS3Objects: 1,
      failedBatchIds: [],
    })
  })

  it('keeps S3 objects when DATA_PURGE_S3_FLAT_FILES is false', async () => {
    vi.stubEnv('DATA_PURGE_S3_FLAT_FILES', 'false')
    const { service, tx, s3 } = setup([{ batch_id: 'b-1', s3_object_key: 'flat-files/ICBC/a.txt' }])

    const result = await service.purgeExpired(now)

    expect(s3.delete).not.toHaveBeenCalled()
    expect(values(tx.$executeRaw.mock.calls[2]!)).toEqual([['b-1']])
    expect(result.deletedS3Objects).toBe(0)
  })

  it('deletes the deterministic S3 key when an upload was attempted but its key was never recorded', async () => {
    const { service, s3 } = setup([
      { batch_id: 'b-1', s3_object_key: null, s3_attempt_count: 1, file_name: 'a b.txt' },
      { batch_id: 'b-2', s3_object_key: null, s3_attempt_count: 1, file_name: null },
    ])

    const result = await service.purgeExpired(now)

    expect(s3.delete).toHaveBeenCalledExactlyOnceWith('address_change/flat-files/ICBC/a b.txt')
    expect(result.deletedS3Objects).toBe(1)
  })

  it('keeps batches from the last 7 days, with their expired requests, so file sequences are not reused', async () => {
    const { service, tx, s3 } = setup([
      { batch_id: 'b-1', s3_object_key: 'flat-files/ICBC/old.txt' },
      { batch_id: 'b-2', s3_object_key: 'flat-files/ICBC/today.txt', is_protected: true },
    ])

    const result = await service.purgeExpired(now)

    expect(s3.delete).toHaveBeenCalledExactlyOnceWith('flat-files/ICBC/old.txt')
    const [detach, deleteRequests, deleteBatches] = tx.$executeRaw.mock.calls
    expect(values(detach!)).toEqual([now, 'retention-job', ['b-1']])
    expect(values(deleteRequests!)[1]).toEqual(['b-2'])
    expect(values(deleteBatches!)).toEqual([['b-1']])
    expect(result.failedBatchIds).toEqual([])
  })

  it('retains a batch and its requests when its S3 copy cannot be deleted', async () => {
    const { service, tx, s3 } = setup([
      { batch_id: 'b-1', s3_object_key: 'flat-files/ICBC/a.txt' },
      { batch_id: 'b-2', s3_object_key: 'flat-files/HEALTH/b.txt' },
    ])
    s3.delete.mockRejectedValueOnce(new Error('denied'))

    const result = await service.purgeExpired(now)

    const [detach, deleteRequests, deleteBatches] = tx.$executeRaw.mock.calls
    expect(values(detach!)).toEqual([now, 'retention-job', ['b-2']])
    expect(values(deleteRequests!)[1]).toEqual(['b-1'])
    expect(values(deleteBatches!)).toEqual([['b-2']])
    expect(result.failedBatchIds).toEqual(['b-1'])
  })
})
