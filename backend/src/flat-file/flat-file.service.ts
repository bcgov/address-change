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
  flatFileName,
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
  status: 'SENT' | 'FAILED' | 'SKIPPED'
  sftpStatus: 'SENT' | 'FAILED' | 'SKIPPED'
  s3Status: 'BACKED_UP' | 'FAILED' | 'SKIPPED'
  remotePath?: string
  s3ObjectKey?: string
}

type DeliveryStep = 'sftp' | 's3'

// A worker that crashed mid-step leaves its claim behind; the step becomes reclaimable after this lease.
const claimLeaseMs = () => (Number(process.env.FLAT_FILE_CLAIM_TIMEOUT_MINUTES) || 30) * 60_000
const s3Enabled = () => Boolean(process.env.FLAT_FILE_S3_BUCKET?.trim())

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
    const fileName = flatFileName(partner.partnerName, now)
    const batchId = await this.prisma.$transaction((tx) =>
      this.freezeBatch(tx, partner, now, snapshot, fileName),
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
      await this.prisma.flatFileBatch.update({
        where: { batchId },
        data: {
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
    fileName: string,
  ): Promise<string | null> {
    // One file per partner per day: serialize generators, then leave later requests for tomorrow.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`flat-file:${partner.partnerId}`}, 0))`
    const { date } = fileStamp(now)
    const fileDate = new Date(`${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6)}`)
    const existing = await tx.flatFileBatch.findFirst({
      where: { partnerId: partner.partnerId, fileDate },
      select: { batchId: true },
    })
    if (existing) {
      this.logger.log(
        `${partner.partnerCode} already has batch ${existing.batchId} for ${fileDate.toISOString().slice(0, 10)}; pending requests wait for the next day`,
      )
      return null
    }
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
    const batch = await tx.flatFileBatch.create({
      data: {
        partnerId: partner.partnerId,
        fileDate,
        fileName,
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
    // TRANSFERRING is included so a batch orphaned by a crash is retried once its lease expires.
    const batches = await this.prisma.flatFileBatch.findMany({
      where: {
        status: { in: ['READY', 'TRANSFERRING', 'SENT', 'FAILED'] },
        fileContent: { not: null },
        OR: [{ transferredAt: null }, ...(s3Enabled() ? [{ s3BackedUpAt: null }] : [])],
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

  // Only one worker owns a step at a time; the row lock makes claim-or-skip atomic.
  private async claimStep(batchId: string, step: DeliveryStep) {
    const now = new Date()
    const cutoff = new Date(now.getTime() - claimLeaseMs())
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT batch_id FROM address_change.flat_file_batch WHERE batch_id = ${batchId}::uuid FOR UPDATE`
      const batch = await tx.flatFileBatch.findUniqueOrThrow({
        where: { batchId },
        include: { partner: true },
      })
      if (
        !['READY', 'TRANSFERRING', 'SENT', 'FAILED'].includes(batch.status) ||
        !batch.fileName ||
        !batch.fileContent
      ) {
        throw new Error(`Batch ${batchId} is not a generated batch awaiting delivery`)
      }
      const done = step === 'sftp' ? batch.transferredAt : batch.s3BackedUpAt
      const claimedAt = step === 'sftp' ? batch.sftpClaimedAt : batch.s3ClaimedAt
      if (done || (claimedAt && claimedAt > cutoff)) return { batch, claimed: false }
      if (claimedAt) {
        this.logger.warn(
          `Recovering expired ${step} claim on batch ${batchId} from ${claimedAt.toISOString()}`,
        )
      }
      const audit = { updatedAt: now, updatedBy: FLAT_FILE_ACTOR }
      await tx.flatFileBatch.update({
        where: { batchId },
        data:
          step === 'sftp'
            ? {
                ...audit,
                status: 'TRANSFERRING',
                sftpClaimedAt: now,
                sftpLastAttemptAt: now,
                sftpAttemptCount: { increment: 1 },
              }
            : {
                ...audit,
                s3ClaimedAt: now,
                s3LastAttemptAt: now,
                s3AttemptCount: { increment: 1 },
              },
      })
      return { batch, claimed: true }
    })
  }

  private async recordFailure(batchId: string, step: DeliveryStep, err: unknown): Promise<void> {
    const error = err as Error
    const code = (error as { code?: string }).code ?? `${step.toUpperCase()}_ERROR`
    const message = `${code}: ${error.message}`.slice(0, 500)
    this.logger.error(`${step.toUpperCase()} step of batch ${batchId} failed (${message})`)
    const audit = { updatedAt: new Date(), updatedBy: FLAT_FILE_ACTOR }
    await this.prisma.flatFileBatch.update({
      where: { batchId },
      data:
        step === 'sftp'
          ? { ...audit, status: 'FAILED', sftpClaimedAt: null, sftpLastError: message }
          : { ...audit, s3ClaimedAt: null, s3LastError: message },
    })
  }

  async transferBatch(batchId: string): Promise<Omit<TransferResult, 'partnerCode' | 'batchId'>> {
    const sftpClaim = await this.claimStep(batchId, 'sftp')
    const { batch } = sftpClaim
    const content = Buffer.from(batch.fileContent as Uint8Array)

    let remotePath: string | undefined
    let s3ObjectKey: string | undefined
    let sftpStatus: TransferResult['sftpStatus']
    if (sftpClaim.claimed) {
      try {
        remotePath = await this.sftp.upload(batch.partner, batch.fileName as string, content)
        await this.prisma.$transaction((tx) => this.markSent(tx, batchId))
        sftpStatus = 'SENT'
      } catch (err) {
        sftpStatus = 'FAILED'
        await this.recordFailure(batchId, 'sftp', err)
      }
    } else {
      sftpStatus = batch.transferredAt ? 'SENT' : 'SKIPPED'
    }

    // Archive only files already delivered; a failed or in-progress SFTP leaves S3 untouched.
    let s3Status: TransferResult['s3Status'] = batch.s3BackedUpAt ? 'BACKED_UP' : 'SKIPPED'
    if (s3Enabled() && sftpStatus === 'SENT' && !batch.s3BackedUpAt) {
      const s3Claim = await this.claimStep(batchId, 's3')
      if (s3Claim.claimed) {
        try {
          s3ObjectKey = await this.s3.upload(
            batch.partner.partnerCode,
            batch.fileName as string,
            content,
            batch.checksum as string,
          )
          const now = new Date()
          await this.prisma.flatFileBatch.update({
            where: { batchId },
            data: {
              s3BackedUpAt: now,
              s3ObjectKey,
              s3ClaimedAt: null,
              s3LastError: null,
              updatedAt: now,
              updatedBy: FLAT_FILE_ACTOR,
            },
          })
          s3Status = 'BACKED_UP'
        } catch (err) {
          s3Status = 'FAILED'
          await this.recordFailure(batchId, 's3', err)
        }
      } else if (s3Claim.batch.s3BackedUpAt) {
        s3Status = 'BACKED_UP'
      }
    }

    const failed = sftpStatus === 'FAILED' || s3Status === 'FAILED'
    return {
      status: failed ? 'FAILED' : sftpStatus === 'SENT' ? 'SENT' : 'SKIPPED',
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
      data: {
        status: 'SENT',
        transferredAt: now,
        sftpClaimedAt: null,
        sftpLastError: null,
        updatedAt: now,
        updatedBy: FLAT_FILE_ACTOR,
      },
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
