import { Logger } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { RetentionModule } from './retention.module'
import { RetentionService, purgeS3FlatFiles, retentionDays } from './retention.service'

const logger = new Logger('RetentionJob')

async function main(): Promise<boolean> {
  const app = await NestFactory.createApplicationContext(RetentionModule)
  try {
    logger.log(
      `Purging data older than ${retentionDays()} days (S3 flat files: ${purgeS3FlatFiles()})`,
    )
    const result = await app.get(RetentionService).purgeExpired()
    logger.log(
      `cutoff=${result.cutoff.toISOString()} requests=${result.deletedRequests} batches=${result.deletedBatches} s3Objects=${result.deletedS3Objects} failedBatches=${result.failedBatchIds.length}`,
    )
    return result.failedBatchIds.length === 0
  } finally {
    await app.close()
  }
}

main()
  .then((ok) => {
    process.exitCode = ok ? 0 : 1
  })
  .catch((err: Error) => {
    logger.error(err.message)
    process.exitCode = 1
  })
