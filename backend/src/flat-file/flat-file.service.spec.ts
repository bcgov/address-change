import { createHash } from 'node:crypto'
import type { PartnerSystem } from '../../generated/prisma/client.js'
import type { RequestEncryptionService } from '../address-change/request-encryption.service'
import { FLAT_FILE_ACTOR, FlatFileService } from './flat-file.service'
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
  nextSequence = 1,
  configuredColumns = columns,
  partnerConfig = partner,
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
      .mockResolvedValueOnce([{ sequence: nextSequence }])
      .mockResolvedValueOnce([{ first: now, last: now }]),
    flatFileBatch: {
      create: vi.fn().mockResolvedValue({ batchId: 'b-1' }),
      update: vi.fn(),
    },
    processingOperation: { updateMany: vi.fn() },
  }
  const prisma = {
    $transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    partnerSystem: { findMany: vi.fn().mockResolvedValue([partnerConfig]) },
    partnerFlatFileColumn: { findMany: vi.fn().mockResolvedValue(configuredColumns) },
    flatFileBatch: { findMany: vi.fn().mockResolvedValue([]), update: vi.fn() },
    processingOperation: { updateMany: vi.fn() },
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
  it('executes the transaction advisory lock before discovering requests', async () => {
    const { service, tx } = setup(['r-1'], [{ id: 'o-1' }])

    await service.generateForPartner(partner, now)

    expect(tx.$executeRaw).toHaveBeenCalledExactlyOnceWith(
      expect.arrayContaining(['SELECT pg_advisory_xact_lock(hashtextextended(', ', 0))']),
      'flat-file:p-1',
    )
    expect(tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.$queryRaw.mock.invocationCallOrder[0]!,
    )
  })
  it('resumes an incomplete batch before creating a sequenced file for later requests', async () => {
    const snapshot = {
      includeHeader: false,
      encoding: 'UTF-8',
      lineEnding: 'CRLF',
      columns,
    }
    const incompleteBatch = {
      batchId: 'b-1',
      status: 'FAILED',
      fileName: 'acbc_requests_icbc_2025_05_16_01.txt',
      fileContent: null,
      checksum: null,
      generatedAt: null,
      recordCount: 0,
      layoutSnapshot: snapshot,
      generationClaimedAt: null,
      partner,
    }
    const resumeTx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      flatFileBatch: {
        findUniqueOrThrow: vi.fn().mockResolvedValue(incompleteBatch),
        update: vi.fn(),
      },
    }
    const nextTx = {
      $executeRaw: vi.fn().mockResolvedValue(1),
      $queryRaw: vi
        .fn()
        .mockResolvedValueOnce([{ request_id: 'r-2' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: 'o-2', request_id: 'r-2' }])
        .mockResolvedValueOnce([{ sequence: 2 }])
        .mockResolvedValueOnce([{ first: now, last: now }]),
      flatFileBatch: {
        create: vi.fn().mockResolvedValue({ batchId: 'b-2' }),
        update: vi.fn(),
      },
      processingOperation: { updateMany: vi.fn() },
    }
    const saveTx = {
      flatFileBatch: { update: vi.fn() },
      processingOperation: { updateMany: vi.fn() },
    }
    const nextSaveTx = {
      flatFileBatch: { update: vi.fn() },
      processingOperation: { updateMany: vi.fn() },
    }
    const create = nextTx.flatFileBatch.create
    const createSpy = vi.fn((args: Parameters<typeof create>[0]) => create(args))
    nextTx.flatFileBatch.create = createSpy
    const prisma = {
      $transaction: vi
        .fn()
        .mockImplementationOnce((callback: (tx: typeof resumeTx) => unknown) => callback(resumeTx))
        .mockImplementationOnce((callback: (tx: typeof saveTx) => unknown) => callback(saveTx))
        .mockImplementationOnce((callback: (tx: typeof nextTx) => unknown) => callback(nextTx))
        .mockImplementationOnce((callback: (tx: typeof nextSaveTx) => unknown) =>
          callback(nextSaveTx),
        ),
      partnerFlatFileColumn: { findMany: vi.fn().mockResolvedValue(columns) },
      flatFileBatch: {
        findMany: vi.fn().mockResolvedValue([{ batchId: 'b-1' }]),
        update: vi.fn(),
      },
      $queryRaw: vi
        .fn()
        .mockResolvedValueOnce([sourceRow])
        .mockResolvedValueOnce([{ ...sourceRow, request_id: 'r-2', last_name: 'Ng' }]),
    }
    const service = new FlatFileService(
      prisma as unknown as PrismaService,
      { upload: vi.fn() } as unknown as SftpTransport,
      { upload: vi.fn() } as unknown as S3Transport,
      { decrypt: vi.fn().mockReturnValue('DL-123') } as unknown as RequestEncryptionService,
    )

    await expect(service.generateForPartner(partner, now)).resolves.toMatchObject({
      batchId: 'b-2',
      status: 'READY',
      fileName: 'acbc_requests_icbc_2025_05_16_02.txt',
    })

    const resumeSave = saveTx.flatFileBatch.update.mock.calls.find(
      ([args]) => args.data.fileContent !== undefined,
    )
    expect(resumeSave?.[0]).toEqual(
      expect.objectContaining({
        where: { batchId: 'b-1' },
        data: expect.objectContaining({
          status: 'READY',
          fileContent: expect.any(Uint8Array),
          generationClaimedAt: null,
        }),
      }),
    )
    expect(resumeTx.flatFileBatch.update).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'BUILDING',
          generationAttemptCount: { increment: 1 },
        }),
      }),
    )
    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          batchSequence: 2,
          fileName: 'acbc_requests_icbc_2025_05_16_02.txt',
        }),
      }),
    )
  })

  it('creates a second sequenced file for new requests on the same partner day', async () => {
    const { service, tx } = setup(['r-1'], [{ id: 'o-1' }], [sourceRow], 2)

    await expect(service.generateForPartner(partner, now)).resolves.toMatchObject({
      status: 'READY',
      batchId: 'b-1',
      fileName: 'acbc_requests_icbc_2025_05_16_02.txt',
    })
    expect(tx.flatFileBatch.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          batchSequence: 2,
          fileName: 'acbc_requests_icbc_2025_05_16_02.txt',
        }),
      }),
    )
  })

  it('omits oversized fixed-width records and marks only those operations FAILED', async () => {
    const fixedColumns = [
      {
        position: 1,
        fieldKey: 'last_name',
        columnName: 'Last Name',
        enabled: true,
        minWidth: 3,
        fixedWidth: 3,
        format: null,
      },
    ]
    const rows = [
      { request_id: 'r-good', last_name: 'Lee' },
      { request_id: 'r-long', last_name: 'Smith' },
    ]
    const { service, tx } = setup(
      ['r-good', 'r-long'],
      [{ id: 'o-good' }, { id: 'o-long' }],
      rows,
      1,
      fixedColumns,
    )

    await expect(service.generateForPartner(partner, now)).resolves.toMatchObject({
      status: 'READY',
      recordCount: 1,
    })
    const stored = tx.flatFileBatch.update.mock.calls.find(
      ([args]) => args.data.fileContent !== undefined,
    )?.[0].data
    expect(Buffer.from(stored.fileContent).toString('utf8')).toBe(`Lee${'\r\n'}`)
    expect(tx.processingOperation.updateMany).toHaveBeenCalledWith({
      where: {
        batchId: 'b-1',
        requestId: { in: ['r-long'] },
        status: 'PENDING',
      },
      data: { status: 'FAILED', updatedAt: expect.any(Date), updatedBy: FLAT_FILE_ACTOR },
    })
    const failedOperationUpdateIndex = tx.processingOperation.updateMany.mock.calls.findIndex(
      ([args]) => args.data.status === 'FAILED',
    )
    expect(tx.flatFileBatch.update.mock.invocationCallOrder[0]).toBeLessThan(
      tx.processingOperation.updateMany.mock.invocationCallOrder[failedOperationUpdateIndex]!,
    )
  })

  it('does not fail rejected operations when saving the file fails', async () => {
    const fixedColumns = [
      {
        position: 1,
        fieldKey: 'last_name',
        columnName: 'Last Name',
        enabled: true,
        minWidth: 3,
        fixedWidth: 3,
        format: null,
      },
    ]
    const { service, prisma, tx } = setup(
      ['r-long', 'r-good'],
      [{ id: 'o-long' }, { id: 'o-good' }],
      [
        { request_id: 'r-long', last_name: 'Smith' },
        { request_id: 'r-good', last_name: 'Lee' },
      ],
      1,
      fixedColumns,
    )
    tx.flatFileBatch.update.mockRejectedValueOnce(new Error('database write failed'))

    await expect(service.generateForPartner(partner, now)).rejects.toThrow('database write failed')

    expect(
      tx.processingOperation.updateMany.mock.calls.some(([args]) => args.data.status === 'FAILED'),
    ).toBe(false)
    expect(prisma.flatFileBatch.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { batchId: 'b-1' },
        data: expect.objectContaining({ status: 'FAILED' }),
      }),
    )
  })

  it('omits a non-ASCII row in US-ASCII mode without failing the rest of the batch', async () => {
    const asciiPartner = { ...partner, flatFileEncoding: 'US-ASCII' }
    const fixedColumns = [
      {
        position: 1,
        fieldKey: 'last_name',
        columnName: 'Last Name',
        enabled: true,
        minWidth: 10,
        fixedWidth: 10,
        format: null,
      },
    ]
    const rows = [
      { request_id: 'r-french', last_name: 'Émile' },
      { request_id: 'r-ascii', last_name: 'Lee' },
    ]
    const { service, tx } = setup(
      ['r-french', 'r-ascii'],
      [{ id: 'o-french' }, { id: 'o-ascii' }],
      rows,
      1,
      fixedColumns,
      asciiPartner,
    )

    await expect(service.generateForPartner(asciiPartner, now)).resolves.toMatchObject({
      status: 'READY',
      recordCount: 1,
    })
    const stored = tx.flatFileBatch.update.mock.calls.find(
      ([args]) => args.data.fileContent !== undefined,
    )?.[0].data
    expect(Buffer.from(stored.fileContent).toString('ascii')).toBe(`Lee${' '.repeat(7)}\r\n`)
    expect(tx.processingOperation.updateMany).toHaveBeenCalledWith({
      where: {
        batchId: 'b-1',
        requestId: { in: ['r-french'] },
        status: 'PENDING',
      },
      data: { status: 'FAILED', updatedAt: expect.any(Date), updatedBy: FLAT_FILE_ACTOR },
    })
  })

  it('uses the residential address in mailing slots when the addresses are shared', async () => {
    const sharedColumns = [
      {
        position: 1,
        fieldKey: 'new_city',
        columnName: 'New City',
        enabled: true,
        minWidth: 8,
        fixedWidth: 8,
        format: null,
      },
      {
        position: 2,
        fieldKey: 'mailing_city',
        columnName: 'Mailing City',
        enabled: true,
        minWidth: 8,
        fixedWidth: 8,
        format: null,
      },
    ]
    const { service, tx } = setup(
      ['r-shared'],
      [{ id: 'o-shared' }],
      [
        {
          request_id: 'r-shared',
          is_mailing_address_same: true,
          new_city: 'Kamloops',
          mailing_city: null,
        },
      ],
      1,
      sharedColumns,
    )

    await service.generateForPartner(partner, now)

    const stored = tx.flatFileBatch.update.mock.calls.find(
      ([args]) => args.data.fileContent !== undefined,
    )?.[0].data
    expect(Buffer.from(stored.fileContent).toString('utf8')).toBe(`KamloopsKamloops${'\r\n'}`)
  })

  it('exposes separate middle initials for partner layout columns', async () => {
    const initialColumns = [
      {
        position: 1,
        fieldKey: 'first_middle_initial',
        columnName: '1st Initial',
        enabled: true,
        minWidth: 1,
        fixedWidth: 1,
        format: null,
      },
      {
        position: 2,
        fieldKey: 'second_middle_initial',
        columnName: '2nd Initial',
        enabled: true,
        minWidth: 1,
        fixedWidth: 1,
        format: null,
      },
    ]
    const { service, prisma, tx } = setup(
      ['r-initials'],
      [{ id: 'o-initials' }],
      [
        {
          request_id: 'r-initials',
          first_middle_initial: 'C',
          second_middle_initial: 'J',
        },
      ],
      1,
      initialColumns,
    )

    await expect(service.generateForPartner(partner, now)).resolves.toMatchObject({
      status: 'READY',
      recordCount: 1,
    })
    const stored = tx.flatFileBatch.update.mock.calls.find(
      ([args]) => args.data.fileContent !== undefined,
    )?.[0].data
    expect(Buffer.from(stored.fileContent).toString('utf8')).toBe(`CJ${'\r\n'}`)
    const sourceQuery = prisma.$queryRaw.mock.calls[0]?.[0].join('')
    expect(sourceQuery).toContain('split_part(source.middle_initials,')
    expect(sourceQuery).not.toContain('JOIN address_change.request_person')
  })

  it('skips partners with no pending operations', async () => {
    const { service, tx } = setup([], [])
    await expect(service.generateForPartner(partner, now)).resolves.toMatchObject({
      status: 'SKIPPED',
      batchId: null,
    })
    expect(tx.flatFileBatch.create).not.toHaveBeenCalled()
  })

  it('records each partner completion after its generation start, not the shared job time', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(now)
    try {
      const { service, prisma, tx } = setup(['r-1'], [{ id: 'o-1' }])
      prisma.partnerSystem.findMany.mockResolvedValue([
        partner,
        { ...partner, partnerId: 'p-2', partnerCode: 'HEALTH', partnerName: 'Health / MSP' },
      ])
      const generationStartedAt: Date[] = []
      const completedAt: Date[] = []
      tx.flatFileBatch.create.mockImplementation(async () => {
        vi.setSystemTime(Date.now() + 250)
        generationStartedAt.push(new Date())
        return { batchId: `b-${generationStartedAt.length}` }
      })
      // Simulate records being loaded after each batch has been created.
      prisma.$queryRaw.mockImplementation(async () => {
        vi.setSystemTime(Date.now() + 1_000)
        completedAt.push(new Date())
        return [sourceRow]
      })
      tx.$queryRaw
        .mockResolvedValueOnce([{ request_id: 'r-2' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: 'o-2', request_id: 'r-2' }])
        .mockResolvedValueOnce([{ sequence: 1 }])
        .mockResolvedValueOnce([{ first: now, last: now }])
        .mockResolvedValueOnce([{ request_id: 'r-3' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: 'o-3', request_id: 'r-3' }])
        .mockResolvedValueOnce([{ sequence: 1 }])
        .mockResolvedValueOnce([{ first: now, last: now }])

      const results = await service.generateAll(now)

      expect(results.map((result) => result.status)).toEqual(['READY', 'READY'])
      expect(tx.flatFileBatch.update).toHaveBeenCalledTimes(2)
      for (const [index, call] of tx.flatFileBatch.update.mock.calls.entries()) {
        const { generatedAt, updatedAt } = call[0].data
        // flat_file_status exposes created_at as generation_started_at.
        expect(generatedAt.getTime()).toBeGreaterThanOrEqual(generationStartedAt[index]!.getTime())
        expect(generatedAt).toEqual(completedAt[index])
        expect(generatedAt.getTime()).toBeGreaterThan(now.getTime())
        expect(updatedAt).toEqual(generatedAt)
      }
    } finally {
      vi.useRealTimers()
    }
  })

  it('stores the layout snapshot, exact bytes, checksum, and first/last request times', async () => {
    const { service, tx, encryption } = setup(['r-1'], [{ id: 'o-1' }])

    const result = await service.generateForPartner(partner, now)

    expect(result).toEqual({
      partnerCode: 'ICBC',
      batchId: 'b-1',
      status: 'READY',
      recordCount: 1,
      fileName: 'acbc_requests_icbc_2025_05_16_01.txt',
    })
    expect(encryption.decrypt).toHaveBeenCalledWith(
      Buffer.from('encrypted'),
      'request:r-1:drivers_license_number',
    )
    expect(tx.flatFileBatch.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          batchSequence: 1,
          fileName: 'acbc_requests_icbc_2025_05_16_01.txt',
          firstRequestReceivedAt: now,
          lastRequestReceivedAt: now,
          layoutSnapshot: expect.objectContaining({ includeHeader: false, encoding: 'UTF-8' }),
        }),
      }),
    )
    expect(tx.processingOperation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { operationId: { in: ['o-1'] } } }),
    )
    const stored = tx.flatFileBatch.update.mock.calls.find(
      ([args]) => args.data.fileContent !== undefined,
    )?.[0].data
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
    const s3Upload = vi.fn().mockResolvedValue('address_change/flat-files/ICBC/ICBC.Address.TXT')
    const { service, prisma, tx } = setupTransfer(sftpUpload, s3Upload)

    await expect(service.transferPending()).resolves.toEqual([
      {
        partnerCode: 'ICBC',
        batchId: 'b-1',
        status: 'SENT',
        sftpStatus: 'SENT',
        s3Status: 'BACKED_UP',
        remotePath: '/inbound/ICBC/20250516191024.txt',
        s3ObjectKey: 'address_change/flat-files/ICBC/ICBC.Address.TXT',
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
        data: expect.objectContaining({
          s3ObjectKey: 'address_change/flat-files/ICBC/ICBC.Address.TXT',
        }),
      }),
    )
    expect(tx.processingOperation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { batchId: 'b-1', status: 'PENDING' },
        data: expect.objectContaining({ status: 'SUCCEEDED' }),
      }),
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
    const s3Upload = vi.fn().mockResolvedValue('address_change/flat-files/ICBC/file.txt')
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
    const s3Upload = vi.fn().mockResolvedValue('address_change/flat-files/ICBC/file.txt')
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
