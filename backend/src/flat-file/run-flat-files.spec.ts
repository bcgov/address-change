import { Logger } from '@nestjs/common'
import { FlatFileService } from './flat-file.service'
import { executeFlatFileJob, startFlatFileCli } from './run-flat-files'

function application(service: Pick<FlatFileService, 'generateAll' | 'transferPending'>) {
  return {
    enableShutdownHooks: vi.fn(),
    get: vi.fn().mockReturnValue(service),
    close: vi.fn().mockResolvedValue(undefined),
  }
}

describe('executeFlatFileJob', () => {
  it('creates the application, enables shutdown hooks, runs both steps, and closes it', async () => {
    const service = {
      generateAll: vi.fn().mockResolvedValue([]),
      transferPending: vi.fn().mockResolvedValue([]),
    }
    const app = application(service)
    const createApplicationContext = vi.fn().mockResolvedValue(app)

    await expect(executeFlatFileJob(createApplicationContext)).resolves.toBe(true)

    expect(app.enableShutdownHooks).toHaveBeenCalledOnce()
    expect(app.get).toHaveBeenCalledWith(FlatFileService)
    expect(service.generateAll).toHaveBeenCalledOnce()
    expect(service.transferPending).toHaveBeenCalledOnce()
    expect(app.close).toHaveBeenCalledOnce()
  })

  it('returns failure and closes the application when transfer execution throws', async () => {
    const service = {
      generateAll: vi.fn().mockResolvedValue([]),
      transferPending: vi.fn().mockRejectedValue(new Error('job failed')),
    }
    const app = application(service)
    const logger = { error: vi.fn() } as unknown as Logger

    await expect(executeFlatFileJob(async () => app, logger)).resolves.toBe(false)

    expect(logger.error).toHaveBeenCalledWith('job failed')
    expect(app.close).toHaveBeenCalledOnce()
  })

  it('returns failure and does not close an app that failed to start', async () => {
    const logger = { error: vi.fn() } as unknown as Logger
    const createApplicationContext = vi.fn().mockRejectedValue(new Error('startup failed'))

    await expect(executeFlatFileJob(createApplicationContext, logger)).resolves.toBe(false)

    expect(logger.error).toHaveBeenCalledWith('startup failed')
  })

  it('sets success and failure process exit codes', async () => {
    const setExitCode = vi.fn()

    await startFlatFileCli(async () => true, setExitCode)
    await startFlatFileCli(async () => false, setExitCode)

    expect(setExitCode.mock.calls).toEqual([[0], [1]])
  })

  it('logs a rejected job and sets a failing exit code', async () => {
    const setExitCode = vi.fn()
    const logger = { error: vi.fn() } as unknown as Logger

    await startFlatFileCli(
      async () => {
        throw new Error('CLI failed')
      },
      setExitCode,
      logger,
    )

    expect(logger.error).toHaveBeenCalledWith('CLI failed')
    expect(setExitCode).toHaveBeenCalledWith(1)
  })
})
