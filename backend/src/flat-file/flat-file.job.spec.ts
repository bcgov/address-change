import { Logger } from '@nestjs/common'
import { runFlatFileJob } from './flat-file.job'

describe('runFlatFileJob', () => {
  const logger = { log: vi.fn(), error: vi.fn() } as unknown as Logger

  it('generates first and then transfers even when daily generation is skipped', async () => {
    const service = {
      generateAll: vi.fn().mockResolvedValue([{ partnerCode: 'ICBC', status: 'SKIPPED' }]),
      transferPending: vi.fn().mockResolvedValue([{ partnerCode: 'ICBC', status: 'SENT' }]),
    }
    await expect(runFlatFileJob(service, logger)).resolves.toBe(true)
    expect(service.generateAll.mock.invocationCallOrder[0]).toBeLessThan(
      service.transferPending.mock.invocationCallOrder[0]!,
    )
  })

  it('still retries existing batches when generation throws', async () => {
    const service = {
      generateAll: vi.fn().mockRejectedValue(new Error('generation unavailable')),
      transferPending: vi.fn().mockResolvedValue([]),
    }
    await expect(runFlatFileJob(service, logger)).resolves.toBe(false)
    expect(service.transferPending).toHaveBeenCalledOnce()
  })

  it('reports failure when delivery fails', async () => {
    const service = {
      generateAll: vi.fn().mockResolvedValue([]),
      transferPending: vi.fn().mockResolvedValue([{ status: 'FAILED' }]),
    }
    await expect(runFlatFileJob(service, logger)).resolves.toBe(false)
  })
})
