import { createHash } from 'node:crypto'
import { Injectable, Logger } from '@nestjs/common'
import type { PartnerSystem, Prisma } from '../../generated/prisma/client.js'
import { PrismaService } from '../prisma.service'
import { type FlatFileRecord, fileStamp, formatterFor } from './flat-file.format'
import { summarizeRequestStatus } from './request-status'
import { SftpTransport } from './sftp.transport'

// Real partner endpoints are not provisioned yet, so batches stop at READY.
export const SFTP_ENABLED = false
export const FLAT_FILE_ACTOR = 'flat-file-job'

export type BatchResult = {
  partnerCode: string
  batchId: string | null
  status: 'SKIPPED' | 'READY' | 'FAILED'
  recordCount: number
  fileName?: string
}

type IdRow = { id: string }

@Injectable()
export class FlatFileService {
  private readonly logger = new Logger(FlatFileService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly sftp: SftpTransport,
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
    const batchId = await this.prisma.$transaction((tx) => this.freezeBatch(tx, partner, now))
    if (!batchId) {
      return { partnerCode: partner.partnerCode, batchId: null, status: 'SKIPPED', recordCount: 0 }
    }
    try {
      const records = await this.loadRecords(batchId)
      const content = Buffer.from(formatterFor(partner.partnerCode)(records), 'utf8')
      const { date, time } = fileStamp(now)
      const fileName = `${partner.partnerCode}.Address.${date}.${time}.TXT`
      await this.prisma.flatFileBatch.update({
        where: { batchId },
        data: {
          fileName,
          fileContent: content,
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
  ): Promise<string | null> {
    const candidates = await tx.$queryRaw<{ request_id: string }[]>`
      SELECT DISTINCT request_id FROM address_change.processing_operation
      WHERE partner_id = ${partner.partnerId}::uuid AND delivery_mode = 'FLAT_FILE'
        AND status = 'PENDING' AND batch_id IS NULL`
    if (candidates.length === 0) return null
    const requestIds = candidates.map((c) => c.request_id)
    await tx.$queryRaw`
      SELECT request_id FROM address_change.address_change_request
      WHERE request_id = ANY(${requestIds}::uuid[]) ORDER BY request_id FOR UPDATE`
    const operations = await tx.$queryRaw<IdRow[]>`
      SELECT operation_id AS id FROM address_change.processing_operation
      WHERE partner_id = ${partner.partnerId}::uuid AND request_id = ANY(${requestIds}::uuid[])
        AND delivery_mode = 'FLAT_FILE' AND status = 'PENDING' AND batch_id IS NULL
      ORDER BY operation_id FOR UPDATE`
    if (operations.length === 0) return null

    const { date } = fileStamp(now)
    const batch = await tx.flatFileBatch.create({
      data: {
        partnerId: partner.partnerId,
        fileDate: new Date(`${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6)}`),
        status: 'BUILDING',
        createdBy: FLAT_FILE_ACTOR,
        updatedBy: FLAT_FILE_ACTOR,
      },
    })
    await tx.processingOperation.updateMany({
      where: { operationId: { in: operations.map((o) => o.id) } },
      data: { batchId: batch.batchId, updatedAt: now, updatedBy: FLAT_FILE_ACTOR },
    })
    await tx.flatFileBatch.update({
      where: { batchId: batch.batchId },
      data: { status: 'READY', updatedAt: now, updatedBy: FLAT_FILE_ACTOR },
    })
    return batch.batchId
  }

  private async loadRecords(batchId: string): Promise<FlatFileRecord[]> {
    const operations = await this.prisma.processingOperation.findMany({
      where: { batchId },
      orderBy: { operationId: 'asc' },
      include: { request: { include: { person: true, address: true } } },
    })
    return operations.map((operation) => {
      const { person, address } = operation.request
      if (!person || !address) {
        throw new Error(`Operation ${operation.operationId} is missing person or address data`)
      }
      return { request: operation.request, person, address }
    })
  }

  async transferBatch(batchId: string): Promise<'SENT' | 'FAILED'> {
    const claimed = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT batch_id FROM address_change.flat_file_batch WHERE batch_id = ${batchId}::uuid FOR UPDATE`
      const batch = await tx.flatFileBatch.findUniqueOrThrow({
        where: { batchId },
        include: { partner: true },
      })
      if (batch.status !== 'READY' || !batch.fileName || !batch.fileContent) {
        throw new Error(`Batch ${batchId} is not a generated READY batch`)
      }
      await tx.flatFileBatch.update({
        where: { batchId },
        data: { status: 'TRANSFERRING', updatedAt: new Date(), updatedBy: FLAT_FILE_ACTOR },
      })
      return batch
    })

    try {
      await this.sftp.upload(
        claimed.partner,
        claimed.fileName as string,
        Buffer.from(claimed.fileContent as Uint8Array),
      )
    } catch (err) {
      const code = (err as { code?: string }).code ?? 'SFTP_ERROR'
      this.logger.error(`Transfer of batch ${batchId} failed (${code}): ${(err as Error).message}`)
      await this.prisma.flatFileBatch.update({
        where: { batchId },
        data: { status: 'FAILED', updatedAt: new Date(), updatedBy: FLAT_FILE_ACTOR },
      })
      return 'FAILED'
    }

    await this.prisma.$transaction((tx) => this.markSent(tx, batchId))
    return 'SENT'
  }

  private async markSent(tx: Prisma.TransactionClient, batchId: string): Promise<void> {
    const now = new Date()
    await tx.$queryRaw`SELECT batch_id FROM address_change.flat_file_batch WHERE batch_id = ${batchId}::uuid FOR UPDATE`
    const requests = await tx.$queryRaw<IdRow[]>`
      SELECT r.request_id AS id FROM address_change.address_change_request r
      WHERE r.request_id IN (SELECT request_id FROM address_change.processing_operation WHERE batch_id = ${batchId}::uuid)
      ORDER BY r.request_id FOR UPDATE`
    const requestIds = requests.map((r) => r.id)
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
      const statuses = operations.filter((o) => o.requestId === requestId).map((o) => o.status)
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
