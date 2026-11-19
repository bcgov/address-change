import { FLAT_FILE_DATA_LOCK } from '../flat-file/flat-file.service'
import type { S3Transport } from '../flat-file/s3.transport'
import type { PrismaService } from '../prisma.service'
import { RetentionService, retentionDays, s3RetentionDays } from './retention.service'

const now = new Date('2026-11-17T10:00:00Z')
const age = (days: number) => new Date(now.getTime() - days * 86_400_000)

function setup(
  batches = [
    { batch_id: 'old', is_protected: false },
    { batch_id: 'recent', is_protected: true },
  ],
) {
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    $executeRaw: vi.fn().mockResolvedValue(2),
  }
  const prisma = {
    withAdvisoryLock: vi.fn((_key: string, work: () => unknown) => work()),
    $queryRaw: vi.fn().mockResolvedValue(batches),
    $transaction: vi.fn((work: (client: typeof tx) => unknown) => work(tx)),
  }
  const s3 = {
    objects: vi.fn(async function* () {
      yield { key: 'orphan-anywhere.txt', createdAt: age(61) }
      yield { key: 'backup.txt', createdAt: age(40) }
      yield { key: 'boundary.txt', createdAt: age(60) }
      yield { key: 'new.txt', createdAt: age(1) }
    }),
    delete: vi.fn().mockResolvedValue(undefined),
  }
  return {
    service: new RetentionService(prisma as unknown as PrismaService, s3 as unknown as S3Transport),
    prisma,
    tx,
    s3,
  }
}

describe('RetentionService', () => {
  beforeEach(() => {
    vi.stubEnv('FLAT_FILE_S3_BUCKET', 'backup-bucket')
    vi.stubEnv('DATA_RETENTION_DAYS', '')
    vi.stubEnv('S3_RETENTION_DAYS', '')
    vi.stubEnv('DATA_PURGE_S3_FLAT_FILES', '')
  })
  afterEach(() => vi.unstubAllEnvs())

  it('validates independent retention settings', () => {
    expect(retentionDays()).toBe(30)
    expect(s3RetentionDays()).toBe(60)
    vi.stubEnv('DATA_RETENTION_DAYS', '7')
    expect(retentionDays()).toBe(7)
    for (const raw of ['6', 'abc', '7.5']) {
      vi.stubEnv('DATA_RETENTION_DAYS', raw)
      expect(retentionDays).toThrow('at least 7')
    }
    vi.stubEnv('S3_RETENTION_DAYS', '90')
    expect(s3RetentionDays()).toBe(90)
    for (const raw of ['0', 'abc', '1.5']) {
      vi.stubEnv('S3_RETENTION_DAYS', raw)
      expect(s3RetentionDays).toThrow('positive whole number')
    }
  })

  it('expires bucket objects by age, independent of batches and database retention', async () => {
    const { service, prisma, tx, s3 } = setup()
    const result = await service.purgeExpired(now)
    expect(prisma.withAdvisoryLock).toHaveBeenCalledWith(FLAT_FILE_DATA_LOCK, expect.any(Function))
    expect(prisma.$queryRaw.mock.calls[0]!.slice(1)).toEqual([age(7), age(30), age(30)])
    expect(s3.delete).toHaveBeenCalledExactlyOnceWith('orphan-anywhere.txt')
    expect(tx.$executeRaw.mock.calls[0]!.slice(1)).toEqual([now, 'retention-job', ['old']])
    expect(tx.$executeRaw.mock.calls[1]!.slice(1)).toEqual([age(30), ['recent']])
    expect(tx.$executeRaw.mock.calls[2]!.slice(1)).toEqual([['old']])
    expect(result).toMatchObject({
      deletedRequests: 2,
      deletedBatches: 2,
      deletedS3Objects: 1,
      s3Errors: 0,
    })
  })

  it('uses the configured S3 retention even with no database batches', async () => {
    vi.stubEnv('S3_RETENTION_DAYS', '30')
    const { service, s3 } = setup([])
    await service.purgeExpired(now)
    expect(s3.delete.mock.calls.map(([key]) => key)).toEqual([
      'orphan-anywhere.txt',
      'backup.txt',
      'boundary.txt',
    ])
  })

  it('locks expired requests and newer requests in purgeable batches before updating operations', async () => {
    const { service, tx } = setup()

    await service.purgeExpired(now)

    expect(tx.$queryRaw).toHaveBeenCalledOnce()
    const [strings, ...values] = tx.$queryRaw.mock.calls[0]! as unknown as [string[], ...unknown[]]
    expect(values).toEqual([age(30), ['old']])
    const sql = strings.join('?')
    expect(sql).toContain('r.created_at < ?')
    expect(sql).toContain('OR EXISTS')
    expect(sql).toContain('o.request_id = r.request_id AND o.batch_id = ANY(?::uuid[])')
    expect(sql).toContain('ORDER BY r.request_id FOR UPDATE OF r')
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.$executeRaw.mock.invocationCallOrder[0]!,
    )
  })

  it.each(['disabled', 'unconfigured'])('skips S3 when %s', async (mode) => {
    if (mode === 'disabled') vi.stubEnv('DATA_PURGE_S3_FLAT_FILES', 'false')
    else vi.stubEnv('FLAT_FILE_S3_BUCKET', '')
    const { service, s3 } = setup()
    await service.purgeExpired(now)
    expect(s3.objects).not.toHaveBeenCalled()
    expect(s3.delete).not.toHaveBeenCalled()
  })

  it('continues on deletion failure without retaining expired database records', async () => {
    vi.stubEnv('S3_RETENTION_DAYS', '30')
    const { service, s3, tx } = setup()
    s3.delete.mockRejectedValueOnce(new Error('denied'))
    expect(await service.purgeExpired(now)).toMatchObject({
      s3Errors: 1,
      deletedS3Objects: 2,
      deletedRequests: 2,
    })
    expect(tx.$executeRaw.mock.calls[2]!.slice(1)).toEqual([['old']])
  })

  it('reports listing failure after database cleanup', async () => {
    const { service, s3, tx } = setup()
    s3.objects.mockImplementation(async function* () {
      yield await Promise.reject(new Error('listing failed'))
    })
    expect(await service.purgeExpired(now)).toMatchObject({ s3Errors: 1, deletedRequests: 2 })
    expect(tx.$executeRaw).toHaveBeenCalledTimes(4)
  })
})
