import { Injectable, Logger } from '@nestjs/common'
import { FLAT_FILE_DATA_LOCK } from '../flat-file/flat-file.service'
import { S3Transport } from '../flat-file/s3.transport'
import { PrismaService } from '../prisma.service'

export const RETENTION_ACTOR = 'retention-job'
const DEFAULT_RETENTION_DAYS = 30
export const MIN_RETENTION_DAYS = 7
// Batch filenames are sequenced per partner and file date, so recent batches must survive to keep sequences unique.
const BATCH_PROTECTION_DAYS = 7
const DAY_MS = 86_400_000

export type PurgeResult = {
  cutoff: Date
  deletedRequests: number
  deletedBatches: number
  deletedS3Objects: number
  s3Errors: number
}

type ExpiredBatch = {
  batch_id: string
  is_protected: boolean
}

export function s3RetentionDays(): number {
  const raw = process.env.S3_RETENTION_DAYS?.trim()
  if (!raw) return 60
  const days = Number(raw)
  if (!Number.isSafeInteger(days) || days < 1) {
    throw new Error('S3_RETENTION_DAYS must be a positive whole number')
  }
  return days
}

export function retentionDays(): number {
  const raw = process.env.DATA_RETENTION_DAYS?.trim()
  if (!raw) return DEFAULT_RETENTION_DAYS
  const days = Number(raw)
  if (!Number.isInteger(days) || days < MIN_RETENTION_DAYS) {
    throw new Error(
      `DATA_RETENTION_DAYS must be an integer of at least ${MIN_RETENTION_DAYS}, got "${raw}"`,
    )
  }
  return days
}

export const purgeS3FlatFiles = () =>
  process.env.DATA_PURGE_S3_FLAT_FILES?.trim().toLowerCase() !== 'false'

@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Transport,
  ) {}

  /** Deletes requests (and cascaded personal data) older than the retention window, plus every flat file containing them. */
  async purgeExpired(now = new Date()): Promise<PurgeResult> {
    const cutoff = new Date(now.getTime() - retentionDays() * DAY_MS)
    const s3Cutoff = new Date(now.getTime() - s3RetentionDays() * DAY_MS)
    return this.prisma.withAdvisoryLock(FLAT_FILE_DATA_LOCK, () =>
      this.purgeAll(now, cutoff, s3Cutoff),
    )
  }

  private async purgeAll(now: Date, cutoff: Date, s3Cutoff: Date): Promise<PurgeResult> {
    const database = await this.purge(now, cutoff)
    let deletedS3Objects = 0
    let s3Errors = 0
    if (purgeS3FlatFiles() && process.env.FLAT_FILE_S3_BUCKET?.trim()) {
      try {
        for await (const object of this.s3.objects()) {
          if (object.createdAt >= s3Cutoff) continue
          try {
            await this.s3.delete(object.key)
            deletedS3Objects++
          } catch {
            s3Errors++
            this.logger.error(
              'S3 retention object deletion failed; the next bucket scan will retry',
            )
          }
        }
      } catch {
        s3Errors++
        this.logger.error('S3 retention bucket scan failed')
      }
    }
    return { ...database, deletedS3Objects, s3Errors }
  }

  private async purge(now: Date, cutoff: Date) {
    const protectedSince = new Date(now.getTime() - BATCH_PROTECTION_DAYS * DAY_MS)
    // A batch created before the cutoff can only hold requests created before it.
    const batches = await this.prisma.$queryRaw<ExpiredBatch[]>`
      SELECT b.batch_id::text,
             b.created_at >= ${protectedSince} AS is_protected
      FROM address_change.flat_file_batch b
      WHERE b.created_at < ${cutoff}
         OR EXISTS (
           SELECT 1 FROM address_change.processing_operation o
           JOIN address_change.address_change_request r USING (request_id)
           WHERE o.batch_id = b.batch_id AND r.created_at < ${cutoff})`
    const purgeable = batches.filter((batch) => !batch.is_protected)

    const batchIds = purgeable.map((b) => b.batch_id)
    // Expired requests in a retained batch wait until that batch can be purged too.
    const retainedBatchIds = batches.map((b) => b.batch_id).filter((id) => !batchIds.includes(id))

    const { deletedRequests, deletedBatches } = await this.prisma.$transaction(async (tx) => {
      // Detached PENDING operations of newer requests are re-batched by the next generation run.
      await tx.$executeRaw`
        UPDATE address_change.processing_operation
        SET batch_id = NULL, updated_at = ${now}, updated_by = ${RETENTION_ACTOR}
        WHERE batch_id = ANY(${batchIds}::uuid[])`
      const deletedRequests = await tx.$executeRaw`
        DELETE FROM address_change.address_change_request r
        WHERE r.created_at < ${cutoff}
          AND NOT EXISTS (
            SELECT 1 FROM address_change.processing_operation o
            WHERE o.request_id = r.request_id AND o.batch_id = ANY(${retainedBatchIds}::uuid[]))`
      const deletedBatches = await tx.$executeRaw`
        DELETE FROM address_change.flat_file_batch WHERE batch_id = ANY(${batchIds}::uuid[])`
      // An expired request kept by a retained batch must not be re-batched, or new batches would keep renewing its protection.
      await tx.$executeRaw`
        UPDATE address_change.processing_operation o
        SET status = 'CANCELLED', updated_at = ${now}, updated_by = ${RETENTION_ACTOR}
        FROM address_change.address_change_request r
        WHERE o.request_id = r.request_id AND r.created_at < ${cutoff}
          AND o.delivery_mode = 'FLAT_FILE' AND o.status = 'PENDING' AND o.batch_id IS NULL`
      return { deletedRequests, deletedBatches }
    })

    return { cutoff, deletedRequests, deletedBatches }
  }
}
