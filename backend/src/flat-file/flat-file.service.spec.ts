import { createHash } from 'node:crypto'
import type { PartnerSystem } from '../../generated/prisma/client.js'
import type { RequestEncryptionService } from '../address-change/request-encryption.service'
import { FlatFileService } from './flat-file.service'
import type { S3Transport } from './s3.transport'
import type { SftpTransport } from './sftp.transport'
import type { PrismaService } from '../prisma.service'

const partner = {
  partnerId: 'p-1',
  partnerCode: 'ICBC',
  partnerName: 'ICBC',
  includeHeader: false,
  flatFileEncoding: 'UTF-8',
} as PartnerSystem
const now = new Date('2025-05-17T02:10:24Z')
const columns = [
  {
    position: 1,
    fieldKey: 'submission_timestamp',
    columnName: 'Submission timestamp',
    enabled: true,
    minWidth: 14,
    format: 'YYYYMMDDHHmmss',
  },
  {
    position: 2,
    fieldKey: 'move_date',
    columnName: 'Move date',
    enabled: true,
    minWidth: 8,
    format: 'YYYYMMDD',
  },
  {
    position: 3,
    fieldKey: 'last_name',
    columnName: 'Last name',
    enabled: true,
    minWidth: 0,
    format: null,
  },
  {
    position: 4,
    fieldKey: 'drivers_license_number',
    columnName: 'DL',
    enabled: true,
    minWidth: 0,
    format: null,
  },
]
const sourceRow = {
  request_id: 'r-1',
  submission_timestamp: now,
  move_date: new Date('2025-06-01T00:00:00Z'),
  last_name: 'Lee',
  drivers_license_number: Buffer.from('encrypted'),
}

function setup(
  pendingRequestIds: string[],
  operations: { id: string }[],
  rows: Record<string, unknown>[] = [sourceRow],
  existingBatch: { batchId: string } | null = null,
) {
  const tx = {
    $executeRaw: vi.fn().mockResolvedValue(1),
    $queryRaw: vi
      .fn()
      .mockResolvedValueOnce(pendingRequestIds.map((request_id) => ({ request_id })))
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(
        operations.map((operation, index) => ({
          id: operation.id,
          request_id: pendingRequestIds[index] ?? 'r-1',
        })),
      )
      .mockResolvedValueOnce([{ first: now, last: now }]),
    flatFileBatch: {
      findFirst: vi.fn().mockResolvedValue(existingBatch),
      create: vi.fn().mockResolvedValue({ batchId: 'b-1' }),
      update: vi.fn(),
    },
    processingOperation: { updateMany: vi.fn() },
  }
  const prisma = {
    $transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    partnerSystem: { findMany: vi.fn().mockResolvedValue([partner]) },
    partnerFlatFileColumn: { findMany: vi.fn().mockResolvedValue(columns) },
    flatFileBatch: { update: vi.fn() },
    $queryRaw: vi.fn().mockResolvedValue(rows),
  }
  const sftp = { upload: vi.fn() }
  const s3 = { upload: vi.fn() }
  const encryption = { decrypt: vi.fn().mockReturnValue('DL-123') }
  const service = new FlatFileService(
    prisma as unknown as PrismaService,
    sftp as unknown as SftpTransport,
    s3 as unknown as S3Transport,
    encryption as unknown as RequestEncryptionService,
  )
  return { service, prisma, tx, sftp, s3, encryption }
}

describe('FlatFileService.generateForPartner', () => {
  it('executes the transaction advisory lock without deserializing its void result', async () => {
    const { service, tx } = setup([], [])

    await service.generateForPartner(partner, now)

    expect(tx.$executeRaw).toHaveBeenCalledExactlyOnceWith(
      expect.arrayContaining([
        'SELECT pg_advisory_xact_lock(hashtextextended(',
        ', 0))',
      ]),
      'flat-file:p-1',
    )
    expect(tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.flatFileBatch.findFirst.mock.invocationCallOrder[0]!,
    )
  })

  it('leaves requests for the next day when the partner already has a batch today', async () => {
    const { service, tx } = setup(['r-1'], [{ id: 'o-1' }], [sourceRow], { batchId: 'b-0' })

    await expect(service.generateForPartner(partner, now)).resolves.toMatchObject({
      status: 'SKIPPED',
      batchId: null,
    })
    expect(tx.flatFileBatch.create).not.toHaveBeenCalled()
  })

  it('skips partners with no pending operations', async () => {
    const { service, tx } = setup([], [])
    await expect(service.generateForPartner(partner, now)).resolves.toMatchObject({
      status: 'SKIPPED',
      batchId: null,
    })
    expect(tx.flatFileBatch.create).not.toHaveBeenCalled()
  })

  it('stores the layout snapshot, exact bytes, checksum, and first/last request times', async () => {
    const { service, prisma, tx, encryption } = setup(['r-1'], [{ id: 'o-1' }])

    const result = await service.generateForPartner(partner, now)

    expect(result).toEqual({
      partnerCode: 'ICBC',
      batchId: 'b-1',
      status: 'READY',
      recordCount: 1,
      fileName: 'acbc_requests_icbc_2025_05_16.txt',
    })
    expect(encryption.decrypt).toHaveBeenCalledWith(
      Buffer.from('encrypted'),
      'request:r-1:drivers_license_number',
    )
    expect(tx.flatFileBatch.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          fileName: 'acbc_requests_icbc_2025_05_16.txt',
          firstRequestReceivedAt: now,
          lastRequestReceivedAt: now,
          layoutSnapshot: expect.objectContaining({ includeHeader: false, encoding: 'UTF-8' }),
        }),
      }),
    )
    expect(tx.processingOperation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { operationId: { in: ['o-1'] } } }),
    )
    const stored = prisma.flatFileBatch.update.mock.calls[0]?.[0].data
    expect(stored.recordCount).toBe(1)
    expect(stored.checksum).toBe(createHash('sha256').update(stored.fileContent).digest('hex'))
    expect(Buffer.from(stored.fileContent).toString('utf8')).toContain(
      '20250516191024 20250601 Lee DL-123',
    )
  })

  it('marks the batch FAILED when a configured field is not in the view', async () => {
    const { service, prisma } = setup(
      ['r-1'],
      [{ id: 'o-1' }],
      [{ request_id: 'r-1', last_name: 'Lee' }],
    )

    await expect(service.generateForPartner(partner, now)).rejects.toThrow(
      'not exposed by flat_file_source',
    )
    expect(prisma.flatFileBatch.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { batchId: 'b-1' },
        data: expect.objectContaining({ status: 'FAILED' }),
      }),
    )
  })
})

describe('FlatFileService transfer', () => {
  beforeEach(() => {
    vi.stubEnv('FLAT_FILE_S3_BUCKET', 'test-archive-bucket')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  function setupTransfer(
    sftpUpload: ReturnType<typeof vi.fn>,
    s3Upload: ReturnType<typeof vi.fn>,
    overrides: Record<string, unknown> = {},
  ) {
    const batch = {
      status: 'READY',
      fileName: 'ICBC.Address.TXT',
      fileContent: Buffer.from('x'),
      checksum: 'checksum',
      generatedAt: now,
      transferredAt: null,
      s3BackedUpAt: null,
      partner,
      ...overrides,
    }
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'r-1' }]),
      flatFileBatch: {
        findUniqueOrThrow: vi.fn().mockResolvedValue(batch),
        update: vi.fn(),
      },
      processingOperation: {
        updateMany: vi.fn(),
        findMany: vi.fn().mockResolvedValue([{ requestId: 'r-1', status: 'SUCCEEDED' }]),
      },
      addressChangeRequest: { update: vi.fn() },
    }
    const prisma = {
      $transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
      flatFileBatch: {
        update: vi.fn(),
        findMany: vi.fn().mockResolvedValue([{ batchId: 'b-1', partner: { partnerCode: 'ICBC' } }]),
      },
    }
    const service = new FlatFileService(
      prisma as unknown as PrismaService,
      { upload: sftpUpload } as unknown as SftpTransport,
      { upload: s3Upload } as unknown as S3Transport,
      { decrypt: vi.fn() } as unknown as RequestEncryptionService,
    )
    return { service, prisma, tx }
  }

  it('delivers the exact same bytes to SFTP and S3, recording each timestamp independently', async () => {
    const sftpUpload = vi.fn().mockResolvedValue('/inbound/ICBC/20250516191024.txt')
    const s3Upload = vi.fn().mockResolvedValue('flat-files/ICBC/ICBC.Address.TXT')
    const { service, prisma, tx } = setupTransfer(sftpUpload, s3Upload)

    await expect(service.transferPending()).resolves.toEqual([
      {
        partnerCode: 'ICBC',
        batchId: 'b-1',
        status: 'SENT',
        sftpStatus: 'SENT',
        s3Status: 'BACKED_UP',
        remotePath: '/inbound/ICBC/20250516191024.txt',
        s3ObjectKey: 'flat-files/ICBC/ICBC.Address.TXT',
      },
    ])
    expect(sftpUpload).toHaveBeenCalledWith(partner, 'ICBC.Address.TXT', Buffer.from('x'))
    expect(s3Upload).toHaveBeenCalledWith(
      partner.partnerCode,
      'ICBC.Address.TXT',
      Buffer.from('x'),
      'checksum',
    )
    expect(prisma.flatFileBatch.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ s3ObjectKey: 'flat-files/ICBC/ICBC.Address.TXT' }),
      }),
    )
    expect(tx.processingOperation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'SUCCEEDED' }) }),
    )
    expect(tx.addressChangeRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'COMPLETED' }) }),
    )
  })

  it('does not resend SFTP if it succeeded but S3 backup failed', async () => {
    const sftpUpload = vi.fn()
    const s3Upload = vi.fn().mockRejectedValue(new Error('bucket unavailable'))
    const { service } = setupTransfer(sftpUpload, s3Upload, {
      status: 'SENT',
      transferredAt: now,
    })

    await expect(service.transferBatch('b-1')).resolves.toMatchObject({
      status: 'FAILED',
      sftpStatus: 'SENT',
      s3Status: 'FAILED',
    })
    expect(sftpUpload).not.toHaveBeenCalled()
  })

  it('skips the S3 archive when the SFTP upload fails', async () => {
    const sftpUpload = vi.fn().mockRejectedValue(new Error('SFTP unavailable'))
    const s3Upload = vi.fn()
    const { service } = setupTransfer(sftpUpload, s3Upload)

    await expect(service.transferBatch('b-1')).resolves.toMatchObject({
      status: 'FAILED',
      sftpStatus: 'FAILED',
      s3Status: 'SKIPPED',
    })
    expect(s3Upload).not.toHaveBeenCalled()
  })

  it('archives to S3 on a later run without resending an already delivered file', async () => {
    const sftpUpload = vi.fn()
    const s3Upload = vi.fn().mockResolvedValue('flat-files/ICBC/file.txt')
    const { service } = setupTransfer(sftpUpload, s3Upload, {
      status: 'SENT',
      transferredAt: now,
    })

    await expect(service.transferBatch('b-1')).resolves.toMatchObject({
      status: 'SENT',
      sftpStatus: 'SENT',
      s3Status: 'BACKED_UP',
    })
    expect(sftpUpload).not.toHaveBeenCalled()
    expect(s3Upload).toHaveBeenCalledOnce()
  })

  it('records attempts and the last error independently per step', async () => {
    const sftpUpload = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error('refused'), { code: 'ECONNREFUSED' }))
    const { service, tx, prisma } = setupTransfer(sftpUpload, vi.fn())

    await service.transferBatch('b-1')

    expect(tx.flatFileBatch.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'TRANSFERRING',
          sftpAttemptCount: { increment: 1 },
        }),
      }),
    )
    expect(prisma.flatFileBatch.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'FAILED',
          sftpClaimedAt: null,
          sftpLastError: 'ECONNREFUSED: refused',
        }),
      }),
    )
    expect(prisma.flatFileBatch.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ s3LastError: expect.anything() }),
      }),
    )
  })

  it('does not process a step another worker claimed within the lease', async () => {
    const sftpUpload = vi.fn()
    const s3Upload = vi.fn()
    const { service } = setupTransfer(sftpUpload, s3Upload, {
      status: 'TRANSFERRING',
      sftpClaimedAt: new Date(),
    })

    await expect(service.transferBatch('b-1')).resolves.toMatchObject({
      status: 'SKIPPED',
      sftpStatus: 'SKIPPED',
      s3Status: 'SKIPPED',
    })
    expect(sftpUpload).not.toHaveBeenCalled()
    expect(s3Upload).not.toHaveBeenCalled()
  })

  it('recovers a batch left TRANSFERRING by a crashed worker once its claim expires', async () => {
    const sftpUpload = vi.fn().mockResolvedValue('/inbound/ICBC/20250516191024.txt')
    const s3Upload = vi.fn().mockResolvedValue('flat-files/ICBC/file.txt')
    const { service } = setupTransfer(sftpUpload, s3Upload, {
      status: 'TRANSFERRING',
      sftpClaimedAt: new Date(Date.now() - 31 * 60_000),
    })

    await expect(service.transferBatch('b-1')).resolves.toMatchObject({
      status: 'SENT',
      sftpStatus: 'SENT',
      s3Status: 'BACKED_UP',
    })
    expect(sftpUpload).toHaveBeenCalledOnce()
  })

  it('skips S3 and succeeds locally when the bucket environment variable is unset', async () => {
    vi.stubEnv('FLAT_FILE_S3_BUCKET', '')
    const sftpUpload = vi.fn().mockResolvedValue('/inbound/ICBC/20250516191024.txt')
    const s3Upload = vi.fn()
    const { service } = setupTransfer(sftpUpload, s3Upload)

    await expect(service.transferBatch('b-1')).resolves.toMatchObject({
      status: 'SENT',
      sftpStatus: 'SENT',
      s3Status: 'SKIPPED',
    })
    expect(sftpUpload).toHaveBeenCalledOnce()
    expect(s3Upload).not.toHaveBeenCalled()
  })
})
