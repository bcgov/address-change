import type { Logger } from '@nestjs/common'
import { executePurge } from './purge-expired-data'
import { RetentionService } from './retention.service'

const logger = () => ({ log: vi.fn(), error: vi.fn() }) as unknown as Logger

function application(purgeExpired: ReturnType<typeof vi.fn>) {
  return {
    get: vi.fn().mockReturnValue({ purgeExpired }),
    close: vi.fn().mockResolvedValue(undefined),
  }
}

const result = (s3Errors = 0) => ({
  cutoff: new Date('2026-10-18T10:00:00Z'),
  deletedRequests: 3,
  deletedBatches: 1,
  deletedS3Objects: 1,
  s3Errors,
})

describe('executePurge', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('runs the purge, logs the summary, and closes the application', async () => {
    const app = application(vi.fn().mockResolvedValue(result()))
    const log = logger()

    await expect(executePurge(async () => app, log)).resolves.toBe(true)

    expect(app.get).toHaveBeenCalledWith(RetentionService)
    expect(log.log).toHaveBeenCalledWith(
      'Purging data older than 30 days (S3 flat files: true, retention: 60 days)',
    )
    expect(log.log).toHaveBeenCalledWith(
      'cutoff=2026-10-18T10:00:00.000Z requests=3 batches=1 s3Objects=1 s3Errors=0',
    )
    expect(app.close).toHaveBeenCalledOnce()
  })

  it('reports failure when an S3 deletion failed', async () => {
    const app = application(vi.fn().mockResolvedValue(result(1)))

    await expect(executePurge(async () => app, logger())).resolves.toBe(false)
    expect(app.close).toHaveBeenCalledOnce()
  })

  it('logs invalid configuration, reports failure, and closes the application', async () => {
    vi.stubEnv('DATA_RETENTION_DAYS', '-1')
    const purgeExpired = vi.fn()
    const app = application(purgeExpired)
    const log = logger()

    await expect(executePurge(async () => app, log)).resolves.toBe(false)

    expect(purgeExpired).not.toHaveBeenCalled()
    expect(log.error).toHaveBeenCalledWith(expect.stringContaining('at least 7'))
    expect(app.close).toHaveBeenCalledOnce()
  })

  it('reports failure without closing an application that failed to start', async () => {
    const log = logger()

    await expect(
      executePurge(() => Promise.reject(new Error('startup failed')), log),
    ).resolves.toBe(false)

    expect(log.error).toHaveBeenCalledWith('startup failed')
  })
})
