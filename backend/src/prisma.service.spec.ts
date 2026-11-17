import type { TestingModule } from '@nestjs/testing'
import { Test } from '@nestjs/testing'
import { PrismaService } from './prisma.service'

describe('PrismaService', () => {
  let service: PrismaService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PrismaService],
    }).compile()

    service = module.get<PrismaService>(PrismaService)
  })

  afterEach(async () => {
    await service.$disconnect()
  })

  it('should be defined', () => {
    expect(service).toBeDefined()
  })

  it('holds the advisory lock on a dedicated connection and destroys it afterwards', async () => {
    const client = { query: vi.fn().mockResolvedValue({}), release: vi.fn() }
    const pool = { connect: vi.fn().mockResolvedValue(client) }
    const original = Reflect.get(service, 'pool')
    Reflect.set(service, 'pool', pool)
    try {
      await expect(service.withAdvisoryLock('job', async () => 'done')).resolves.toBe('done')
      await expect(
        service.withAdvisoryLock('job', () => Promise.reject(new Error('boom'))),
      ).rejects.toThrow('boom')
    } finally {
      Reflect.set(service, 'pool', original)
    }

    expect(client.query).toHaveBeenCalledWith('SELECT pg_advisory_lock(hashtextextended($1, 0))', [
      'job',
    ])
    expect(client.release.mock.calls).toEqual([[true], [true]])
  })
})
