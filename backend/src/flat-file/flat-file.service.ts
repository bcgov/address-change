import { createHash } from 'node:crypto'
import { Injectable, Logger } from '@nestjs/common'
import type { PartnerSystem, Prisma } from '../../generated/prisma/client.js'
import { RequestEncryptionService } from '../address-change/request-encryption.service'
import { PrismaService } from '../prisma.service'
import {
  type FlatFileColumn,
  type FlatFileSourceRow,
  encodeFlatFileContent,
  fileStamp,
  formatFlatFile,
} from './flat-file.format'
import { summarizeRequestStatus } from './request-status'
import { S3Transport } from './s3.transport'
import { SftpTransport } from './sftp.transport'

export const FLAT_FILE_ACTOR = 'flat-file-job'

export type BatchResult = {
  partnerCode: string
  batchId: string | null
  status: 'SKIPPED' | 'READY' | 'FAILED'
  recordCount: number
  fileName?: string
}

export type TransferResult = {
  partnerCode: string
  batchId: string
  status: 'SENT' | 'FAILED'
  sftpStatus: 'SENT' | 'FAILED' | 'SKIPPED'
  s3Status: 'BACKED_UP' | 'FAILED' | 'SKIPPED'
  remotePath?: string
  s3ObjectKey?: string
}

type IdRow = { id: string; request_id: string }
type RequestWindow = { first: Date | null; last: Date | null }
const requestFieldContexts = {
  drivers_license_number: 'drivers_license_number',
  phn: 'phn',
  security_keyword: 'security_keyword',
} as const
type BatchCandidate = {
  batchId: string
  partner: Pick<PartnerSystem, 'partnerCode'>
}

@Injectable()
export class FlatFileService {
  private readonly logger = new Logger(FlatFileService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly sftp: SftpTransport,
    private readonly s3: S3Transport,
    private readonly encryption: RequestEncryptionService,
  ) {}

  async generateAll(now = new Date()): Promise<BatchResult[]> {
    const partners = await this.prisma.partnerSystem.findMany({
      where: { active: true, deliveryMode: 'FLAT_FILE' },
      orderBy: { partnerCode: 'asc' },
    })
    const results: BatchResult[] = []
    for (const partner of partners) {
      try {
        results.push(await this.generateForPartner(partner, now))
      } catch (err) {
        this.logger.error(
          `Flat file generation failed for ${partner.partnerCode}: ${(err as Error).message}`,
        )
        results.push({
          partnerCode: partner.partnerCode,
          batchId: null,
          status: 'FAILED',
          recordCount: 0,
        })
      }
    }
    return results
  }

  async generateForPartner(partner: PartnerSystem, now = new Date()): Promise<BatchResult> {
    const configuredColumns = await this.prisma.partnerFlatFileColumn.findMany({
      where: { partnerId: partner.partnerId, enabled: true },
      orderBy: { position: 'asc' },
    })
    if (configuredColumns.length === 0) {
      throw new Error(`No enabled flat-file columns configured for ${partner.partnerCode}`)
    }
    const columns: FlatFileColumn[] = configuredColumns.map((column) => ({
      position: column.position,
      fieldKey: column.fieldKey,
      columnName: column.columnName,
      enabled: column.enabled,
      minWidth: column.minWidth,
      format: column.format,
    }))
    const snapshot = {
      includeHeader: partner.includeHeader,
      encoding: partner.flatFileEncoding,
      lineEnding: 'CRLF',
      columns,
    }
    const batchId = await this.prisma.$transaction((tx) =>
      this.freezeBatch(tx, partner, now, snapshot),
    )
    if (!batchId) {
      return {
        partnerCode: partner.partnerCode,
        batchId: null,
        status: 'SKIPPED',
        recordCount: 0,
      }
    }
    try {
      const records = await this.loadRecords(batchId, columns)
      const content = encodeFlatFileContent(
        formatFlatFile(records, columns, partner.includeHeader),
        partner.flatFileEncoding,
      )
      const { date, time } = fileStamp(now)
      const fileName = `${partner.partnerCode}.Address.${date}.${time}.TXT`
      await this.prisma.flatFileBatch.update({
        where: { batchId },
        data: {
          fileName,
          fileContent: new Uint8Array(content),
          checksum: createHash('sha256').update(content).digest('hex'),
          recordCount: records.length,
          generatedAt: now,
          updatedAt: now,
          updatedBy: FLAT_FILE_ACTOR,
        },
      })
      return {
        partnerCode: partner.partnerCode,
        batchId,
        status: 'READY',
        recordCount: records.length,
        fileName,
      }
    } catch (err) {
      await this.prisma.flatFileBatch.update({
        where: { batchId },
        data: { status: 'FAILED', updatedAt: new Date(), updatedBy: FLAT_FILE_ACTOR },
      })
      throw err
    }
  }

  // Lock order per migrations/README.md: requests by request_id, then operations by operation_id.
  private async freezeBatch(
    tx: Prisma.TransactionClient,
    partner: PartnerSystem,
    now: Date,
    layoutSnapshot: object,
  ): Promise<string | null> {
    const candidates = await tx.$queryRaw<{ request_id: string }[]>`
      SELECT DISTINCT request_id FROM address_change.processing_operation
      WHERE partner_id = ${partner.partnerId}::uuid AND delivery_mode = 'FLAT_FILE'
        AND status = 'PENDING' AND batch_id IS NULL`
    if (candidates.length === 0) return null
    const requestIds = candidates.map((candidate) => candidate.request_id)
    await tx.$queryRaw`
      SELECT request_id FROM address_change.address_change_request
      WHERE request_id = ANY(${requestIds}::uuid[]) ORDER BY request_id FOR UPDATE`
    const operations = await tx.$queryRaw<IdRow[]>`
      SELECT operation_id AS id, request_id FROM address_change.processing_operation
      WHERE partner_id = ${partner.partnerId}::uuid AND request_id = ANY(${requestIds}::uuid[])
        AND delivery_mode = 'FLAT_FILE' AND status = 'PENDING' AND batch_id IS NULL
      ORDER BY operation_id FOR UPDATE`
    if (operations.length === 0) return null

    const batchRequestIds = [...new Set(operations.map((operation) => operation.request_id))]
    const window = await tx.$queryRaw<RequestWindow[]>`
      SELECT MIN(received_at) AS first, MAX(received_at) AS last
      FROM address_change.address_change_request
      WHERE request_id = ANY(${batchRequestIds}::uuid[])`
    const { date } = fileStamp(now)
    const batch = await tx.flatFileBatch.create({
      data: {
        partnerId: partner.partnerId,
        fileDate: new Date(`${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6)}`),
        firstRequestReceivedAt: window[0]?.first,
        lastRequestReceivedAt: window[0]?.last,
        layoutSnapshot: layoutSnapshot as Prisma.InputJsonValue,
        status: 'BUILDING',
        createdBy: FLAT_FILE_ACTOR,
        updatedBy: FLAT_FILE_ACTOR,
      },
    })
    await tx.processingOperation.updateMany({
      where: { operationId: { in: operations.map((operation) => operation.id) } },
      data: { batchId: batch.batchId, updatedAt: now, updatedBy: FLAT_FILE_ACTOR },
    })
    await tx.flatFileBatch.update({
      where: { batchId: batch.batchId },
      data: { status: 'READY', updatedAt: now, updatedBy: FLAT_FILE_ACTOR },
    })
    return batch.batchId
  }

  private async loadRecords(
    batchId: string,
    columns: readonly FlatFileColumn[],
  ): Promise<FlatFileSourceRow[]> {
    const records = await this.prisma.$queryRaw<FlatFileSourceRow[]>`
      SELECT source.* FROM address_change.flat_file_source source
      JOIN address_change.processing_operation operation USING (request_id)
      WHERE operation.batch_id = ${batchId}::uuid
      ORDER BY source.submission_timestamp, source.request_id`
    const sensitiveKeys = new Set(
      columns.map((column) => column.fieldKey).filter((key) => key in requestFieldContexts),
    )
    return records.map((record) => {
      const hydrated = { ...record }
      for (const fieldKey of sensitiveKeys) {
        const encrypted = record[fieldKey]
        if (encrypted instanceof Uint8Array) {
          const context = requestFieldContexts[fieldKey as keyof typeof requestFieldContexts]
          hydrated[fieldKey] = this.encryption.decrypt(
            encrypted,
            `request:${record.request_id}:${context}`,
          )
        }
      }
      return hydrated
    })
  }

  async transferPending(): Promise<TransferResult[]> {
    const s3Enabled = Boolean(process.env.FLAT_FILE_S3_BUCKET?.trim())
    const deliveryFilter = s3Enabled
      ? {
          status: { in: ['READY', 'SENT', 'FAILED'] },
          OR: [
            { status: { in: ['READY', 'FAILED'] }, transferredAt: null },
            { s3BackedUpAt: null },
          ],
        }
      : { status: { in: ['READY', 'FAILED'] }, transferredAt: null }
    const batches = await this.prisma.flatFileBatch.findMany({
      where: {
        ...deliveryFilter,
        fileContent: { not: null },
      },
      orderBy: { generatedAt: 'asc' },
      select: { batchId: true, partner: { select: { partnerCode: true } } },
    })
    const results: TransferResult[] = []
    for (const { batchId, partner } of batches as BatchCandidate[]) {
      try {
        results.push({
          partnerCode: partner.partnerCode,
          batchId,
          ...(await this.transferBatch(batchId)),
        })
      } catch (err) {
        this.logger.error(`Delivery of batch ${batchId} could not start: ${(err as Error).message}`)
        results.push({
          partnerCode: partner.partnerCode,
          batchId,
          status: 'FAILED',
          sftpStatus: 'FAILED',
          s3Status: 'FAILED',
        })
      }
    }
    return results
  }

  async transferBatch(batchId: string): Promise<Omit<TransferResult, 'partnerCode' | 'batchId'>> {
    const claimed = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT batch_id FROM address_change.flat_file_batch WHERE batch_id = ${batchId}::uuid FOR UPDATE`
      const batch = await tx.flatFileBatch.findUniqueOrThrow({
        where: { batchId },
        include: { partner: true },
      })
      if (
        !['READY', 'SENT', 'FAILED'].includes(batch.status) ||
        !batch.fileName ||
        !batch.fileContent
      ) {
        throw new Error(`Batch ${batchId} is not a generated batch awaiting delivery`)
      }
      const sendSftp = !batch.transferredAt
      const backupS3 = Boolean(process.env.FLAT_FILE_S3_BUCKET?.trim()) && !batch.s3BackedUpAt
      if (!sendSftp && !backupS3)
        throw new Error(`Batch ${batchId} has already been delivered and archived`)
      if (sendSftp) {
        await tx.flatFileBatch.update({
          where: { batchId },
          data: { status: 'TRANSFERRING', updatedAt: new Date(), updatedBy: FLAT_FILE_ACTOR },
        })
      }
      return { batch, sendSftp, backupS3 }
    })

    const { batch, sendSftp, backupS3 } = claimed
    const content = Buffer.from(batch.fileContent as Uint8Array)
    const { date, time } = fileStamp(batch.generatedAt as Date)
    const sftpPromise = sendSftp
      ? this.sftp.upload(batch.partner, `${date}${time}.txt`, content)
      : Promise.resolve(undefined)
    const s3Promise = backupS3
      ? this.s3.upload(
          batch.partner.partnerCode,
          batch.fileName as string,
          content,
          batch.checksum as string,
        )
      : Promise.resolve(undefined)
    const [sftpResult, s3Result] = await Promise.allSettled([sftpPromise, s3Promise])

    let remotePath: string | undefined
    let s3ObjectKey: string | undefined
    let sftpStatus: TransferResult['sftpStatus'] = 'SKIPPED'
    let s3Status: TransferResult['s3Status'] = 'SKIPPED'
    if (sendSftp) {
      if (sftpResult.status === 'fulfilled') {
        remotePath = sftpResult.value
        sftpStatus = 'SENT'
        await this.prisma.$transaction((tx) => this.markSent(tx, batchId))
      } else {
        sftpStatus = 'FAILED'
        const error = sftpResult.reason as Error
        const code = (error as { code?: string }).code ?? 'SFTP_ERROR'
        this.logger.error(`SFTP transfer of batch ${batchId} failed (${code}): ${error.message}`)
        await this.prisma.flatFileBatch.update({
          where: { batchId },
          data: { status: 'FAILED', updatedAt: new Date(), updatedBy: FLAT_FILE_ACTOR },
        })
      }
    } else {
      sftpStatus = batch.transferredAt ? 'SENT' : 'FAILED'
    }

    if (backupS3) {
      if (s3Result.status === 'fulfilled') {
        s3ObjectKey = s3Result.value
        s3Status = 'BACKED_UP'
        await this.prisma.flatFileBatch.update({
          where: { batchId },
          data: {
            s3BackedUpAt: new Date(),
            s3ObjectKey,
            updatedAt: new Date(),
            updatedBy: FLAT_FILE_ACTOR,
          },
        })
      } else {
        s3Status = 'FAILED'
        const error = s3Result.reason as Error
        const code = (error as { code?: string }).code ?? 'S3_ERROR'
        this.logger.error(`S3 backup of batch ${batchId} failed (${code}): ${error.message}`)
      }
    } else {
      s3Status = batch.s3BackedUpAt ? 'BACKED_UP' : 'SKIPPED'
    }

    return {
      status: sftpStatus === 'SENT' && s3Status !== 'FAILED' ? 'SENT' : 'FAILED',
      sftpStatus,
      s3Status,
      ...(remotePath ? { remotePath } : {}),
      ...(s3ObjectKey ? { s3ObjectKey } : {}),
    }
  }

  private async markSent(tx: Prisma.TransactionClient, batchId: string): Promise<void> {
    const now = new Date()
    await tx.$queryRaw`SELECT batch_id FROM address_change.flat_file_batch WHERE batch_id = ${batchId}::uuid FOR UPDATE`
    const requests = await tx.$queryRaw<IdRow[]>`
      SELECT r.request_id AS id FROM address_change.address_change_request r
      WHERE r.request_id IN (SELECT request_id FROM address_change.processing_operation WHERE batch_id = ${batchId}::uuid)
      ORDER BY r.request_id FOR UPDATE`
    const requestIds = requests.map((request) => request.id)
    await tx.$queryRaw`
      SELECT operation_id FROM address_change.processing_operation
      WHERE request_id = ANY(${requestIds}::uuid[]) ORDER BY operation_id FOR UPDATE`

    await tx.flatFileBatch.update({
      where: { batchId },
      data: { status: 'SENT', transferredAt: now, updatedAt: now, updatedBy: FLAT_FILE_ACTOR },
    })
    await tx.processingOperation.updateMany({
      where: { batchId },
      data: { status: 'SUCCEEDED', updatedAt: now, updatedBy: FLAT_FILE_ACTOR },
    })
    const operations = await tx.processingOperation.findMany({
      where: { requestId: { in: requestIds } },
      select: { requestId: true, status: true },
    })
    for (const requestId of requestIds) {
      const statuses = operations
        .filter((operation) => operation.requestId === requestId)
        .map((operation) => operation.status)
      await tx.addressChangeRequest.update({
        where: { requestId },
        data: {
          status: summarizeRequestStatus(statuses),
          updatedAt: now,
          updatedBy: FLAT_FILE_ACTOR,
        },
      })
    }
  }
}
