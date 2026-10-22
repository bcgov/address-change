import { Logger } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { FlatFileModule } from './flat-file.module'
import { FlatFileService, SFTP_ENABLED } from './flat-file.service'

const logger = new Logger('FlatFileJob')

async function main(): Promise<boolean> {
  const app = await NestFactory.createApplicationContext(FlatFileModule)
  try {
    const service = app.get(FlatFileService)
    const results = await service.generateAll()
    let ok = results.every((r) => r.status !== 'FAILED')
    for (const result of results) {
      logger.log(
        `${result.partnerCode}: ${result.status} batch=${result.batchId ?? '-'} records=${result.recordCount} file=${result.fileName ?? '-'}`,
      )
      if (SFTP_ENABLED && result.status === 'READY' && result.batchId) {
        ok = (await service.transferBatch(result.batchId)) === 'SENT' && ok
      }
    }
    if (!SFTP_ENABLED) logger.log('SFTP transfer disabled; generated batches remain READY')
    return ok
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
