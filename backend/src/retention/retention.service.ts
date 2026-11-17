import { Injectable, Logger } from '@nestjs/common'
import { FLAT_FILE_DATA_LOCK } from '../flat-file/flat-file.service'
import { S3Transport, flatFileObjectKey } from '../flat-file/s3.transport'
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
  failedBatchIds: string[]
}

type ExpiredBatch = {
  batch_id: string
  s3_object_key: string | null
  s3_attempt_count: number
  partner_code: string
  file_name: string | null
  is_protected: boolean
}

// An upload interrupted before its key was recorded may still have written the deterministic key.
function archiveKey(batch: ExpiredBatch): string | null {
  if (batch.s3_object_key) return batch.s3_object_key
  return batch.s3_attempt_count > 0 && batch.file_name
    ? flatFileObjectKey(batch.partner_code, batch.file_name)
    : null
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
    return this.prisma.withAdvisoryLock(FLAT_FILE_DATA_LOCK, () => this.purge(now, cutoff))
  }

  private async purge(now: Date, cutoff: Date): Promise<PurgeResult> {
    const protectedSince = new Date(now.getTime() - BATCH_PROTECTION_DAYS * DAY_MS)
    // A batch created before the cutoff can only hold requests created before it.
    const batches = await this.prisma.$queryRaw<ExpiredBatch[]>`
      SELECT b.batch_id::text, b.s3_object_key, b.s3_attempt_count, p.partner_code, b.file_name,
             b.created_at >= ${protectedSince} AS is_protected
      FROM address_change.flat_file_batch b
      JOIN address_change.partner_system p USING (partner_id)
      WHERE b.created_at < ${cutoff}
         OR EXISTS (
           SELECT 1 FROM address_change.processing_operation o
           JOIN address_change.address_change_request r USING (request_id)
           WHERE o.batch_id = b.batch_id AND r.created_at < ${cutoff})`
    const purgeable = batches.filter((batch) => !batch.is_protected)

    const failed = new Set<string>()
    let deletedS3Objects = 0
    if (purgeS3FlatFiles()) {
      for (const batch of purgeable) {
        const key = archiveKey(batch)
        if (!key) continue
        try {
          await this.s3.delete(key)
          deletedS3Objects++
        } catch (err) {
          failed.add(batch.batch_id)
          this.logger.error(
            `S3 deletion of ${key} (batch ${batch.batch_id}) failed: ${(err as Error).message}`,
          )
        }
      }
    }
    // Keep a batch whose S3 copy survived, and its requests, so the next run retries the whole set.
    const batchIds = purgeable.map((b) => b.batch_id).filter((id) => !failed.has(id))
    const failedBatchIds = [...failed]
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
      return { deletedRequests, deletedBatches }
    })

    return { cutoff, deletedRequests, deletedBatches, deletedS3Objects, failedBatchIds }
  }
}
