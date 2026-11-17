import { Logger } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { RetentionModule } from './retention.module'
import { RetentionService, purgeS3FlatFiles, retentionDays } from './retention.service'

type ApplicationContext = {
  get<T>(token: new (...args: never[]) => T): T
  close(): Promise<void>
}

export async function executePurge(
  createApplicationContext: () => Promise<ApplicationContext>,
  logger: Pick<Logger, 'log' | 'error'> = new Logger('RetentionJob'),
): Promise<boolean> {
  let app: ApplicationContext | undefined
  try {
    app = await createApplicationContext()
    logger.log(
      `Purging data older than ${retentionDays()} days (S3 flat files: ${purgeS3FlatFiles()})`,
    )
    const result = await app.get(RetentionService).purgeExpired()
    logger.log(
      `cutoff=${result.cutoff.toISOString()} requests=${result.deletedRequests} batches=${result.deletedBatches} s3Objects=${result.deletedS3Objects} failedBatches=${result.failedBatchIds.length}`,
    )
    return result.failedBatchIds.length === 0
  } catch (err) {
    logger.error((err as Error).message)
    return false
  } finally {
    await app?.close()
  }
}

/* v8 ignore next -- only execute the CLI when Node loads this file directly. */
if (require.main === module) {
  void executePurge(() => NestFactory.createApplicationContext(RetentionModule)).then((ok) => {
    process.exitCode = ok ? 0 : 1
  })
}
