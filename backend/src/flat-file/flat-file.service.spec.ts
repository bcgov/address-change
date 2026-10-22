import { createHash } from 'node:crypto'
import type { PartnerSystem } from '../../generated/prisma/client.js'
import { FLAT_FILE_ACTOR, FlatFileService } from './flat-file.service'
import { SftpNotConfiguredError, type SftpTransport } from './sftp.transport'
import type { PrismaService } from '../prisma.service'

const partner = { partnerId: 'p-1', partnerCode: 'ICBC' } as PartnerSystem
const now = new Date('2025-05-17T02:10:24Z')

function operation(id: string, withPerson = true) {
  return {
    operationId: id,
    request: {
      receivedAt: now,
      effectiveDate: new Date('2025-06-01'),
      person: withPerson
        ? {
            firstName: 'Ann',
            lastName: 'Lee',
            dateOfBirth: new Date('1990-01-01'),
            heightCm: null,
            weightKg: null,
          }
        : null,
      address: {
        oldAddressLineOne: '1 Old St',
        oldCity: 'Victoria',
        oldProvince: 'BC',
        oldPostalCode: 'V8V1A1',
        oldCountry: 'CA',
        newAddressLineOne: '2 New St',
        newCity: 'Victoria',
        newProvince: 'BC',
        newPostalCode: 'V8V2B2',
        newCountry: 'CA',
        isMailingAddressSame: true,
      },
    },
  }
}

function setup(pendingRequestIds: string[], operations: ReturnType<typeof operation>[]) {
  const tx = {
    $queryRaw: vi
      .fn()
      .mockResolvedValueOnce(pendingRequestIds.map((request_id) => ({ request_id })))
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(operations.map((o) => ({ id: o.operationId }))),
    flatFileBatch: { create: vi.fn().mockResolvedValue({ batchId: 'b-1' }), update: vi.fn() },
    processingOperation: { updateMany: vi.fn() },
  }
  const prisma = {
    $transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    partnerSystem: { findMany: vi.fn().mockResolvedValue([partner]) },
    flatFileBatch: { update: vi.fn() },
    processingOperation: { findMany: vi.fn().mockResolvedValue(operations) },
  }
  const sftp = { upload: vi.fn() }
  const service = new FlatFileService(
    prisma as unknown as PrismaService,
    sftp as unknown as SftpTransport,
  )
  return { service, prisma, tx, sftp }
}

describe('FlatFileService.generateForPartner', () => {
  it('skips partners with no pending operations', async () => {
    const { service, tx } = setup([], [])
    await expect(service.generateForPartner(partner, now)).resolves.toMatchObject({
      status: 'SKIPPED',
      batchId: null,
    })
    expect(tx.flatFileBatch.create).not.toHaveBeenCalled()
  })

  it('freezes membership as READY and stores the generated file', async () => {
    const ops = [operation('o-1'), operation('o-2')]
    const { service, prisma, tx } = setup(['r-1', 'r-2'], ops)

    const result = await service.generateForPartner(partner, now)

    expect(result).toEqual({
      partnerCode: 'ICBC',
      batchId: 'b-1',
      status: 'READY',
      recordCount: 2,
      fileName: 'ICBC.Address.20250516.191024.TXT',
    })
    expect(tx.processingOperation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { operationId: { in: ['o-1', 'o-2'] } } }),
    )
    expect(tx.flatFileBatch.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'READY', updatedBy: FLAT_FILE_ACTOR }),
      }),
    )
    const stored = prisma.flatFileBatch.update.mock.calls[0]?.[0].data
    expect(stored.recordCount).toBe(2)
    expect(stored.checksum).toBe(createHash('sha256').update(stored.fileContent).digest('hex'))
    expect(Buffer.from(stored.fileContent).toString('utf8').split('\r\n')).toHaveLength(3)
  })

  it('marks the batch FAILED when a record cannot be built', async () => {
    const { service, prisma } = setup(['r-1'], [operation('o-1', false)])

    await expect(service.generateAll(now)).resolves.toEqual([
      { partnerCode: 'ICBC', batchId: null, status: 'FAILED', recordCount: 0 },
    ])
    expect(prisma.flatFileBatch.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { batchId: 'b-1' },
        data: expect.objectContaining({ status: 'FAILED' }),
      }),
    )
  })
})

describe('FlatFileService.transferBatch', () => {
  it('claims the batch as TRANSFERRING and records FAILED when SFTP is not configured', async () => {
    const batch = {
      status: 'READY',
      fileName: 'ICBC.Address.TXT',
      fileContent: Buffer.from('x'),
      partner,
    }
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      flatFileBatch: { findUniqueOrThrow: vi.fn().mockResolvedValue(batch), update: vi.fn() },
    }
    const prisma = {
      $transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
      flatFileBatch: { update: vi.fn() },
    }
    const sftp = { upload: vi.fn().mockRejectedValue(new SftpNotConfiguredError('not enabled')) }
    const service = new FlatFileService(
      prisma as unknown as PrismaService,
      sftp as unknown as SftpTransport,
    )

    await expect(service.transferBatch('b-1')).resolves.toBe('FAILED')
    expect(tx.flatFileBatch.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'TRANSFERRING' }) }),
    )
    expect(prisma.flatFileBatch.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }),
    )
    expect(prisma.$transaction).toHaveBeenCalledTimes(1)
  })
})
