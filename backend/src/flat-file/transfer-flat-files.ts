import { Logger } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { FlatFileModule } from './flat-file.module'
import { FlatFileService } from './flat-file.service'

const logger = new Logger('FlatFileTransfer')

async function main(): Promise<boolean> {
  const app = await NestFactory.createApplicationContext(FlatFileModule)
  try {
    const results = await app.get(FlatFileService).transferPending()
    if (results.length === 0) logger.log('No READY batches to transfer')
    for (const result of results) {
      logger.log(
        `${result.partnerCode}: ${result.status} batch=${result.batchId} remote=${result.remotePath ?? '-'}`,
      )
    }
    return results.every((r) => r.status === 'SENT')
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
