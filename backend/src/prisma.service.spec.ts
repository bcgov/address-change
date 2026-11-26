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

  it('holds a transaction-scoped advisory lock for the duration of the work', async () => {
    const client = { query: vi.fn().mockResolvedValue({}), release: vi.fn() }
    const pool = { connect: vi.fn().mockResolvedValue(client) }
    const original = Reflect.get(service, 'pool')
    Reflect.set(service, 'pool', pool)
    const statements = () => client.query.mock.calls.map(([sql]) => sql)
    try {
      await expect(
        service.withAdvisoryLock('job', async () => {
          expect(statements()).toEqual([
            'BEGIN',
            'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
          ])
          return 'done'
        }),
      ).resolves.toBe('done')
      expect(statements().at(-1)).toBe('COMMIT')
      expect(client.query).toHaveBeenCalledWith(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        ['job'],
      )

      client.query.mockClear()
      client.query.mockImplementation(async (sql: string) => {
        if (sql === 'ROLLBACK') throw new Error('connection lost')
        return {}
      })
      await expect(
        service.withAdvisoryLock('job', () => Promise.reject(new Error('boom'))),
      ).rejects.toThrow('boom')
      expect(statements()).toEqual([
        'BEGIN',
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        'ROLLBACK',
      ])
    } finally {
      Reflect.set(service, 'pool', original)
    }

    expect(client.release.mock.calls).toEqual([[true], [true]])
  })
})
