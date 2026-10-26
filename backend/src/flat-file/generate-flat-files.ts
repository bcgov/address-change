import { Logger } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { FlatFileModule } from './flat-file.module'
import { FlatFileService } from './flat-file.service'

const logger = new Logger('FlatFileJob')

async function main(): Promise<boolean> {
  const app = await NestFactory.createApplicationContext(FlatFileModule)
  try {
    const results = await app.get(FlatFileService).generateAll()
    for (const result of results) {
      logger.log(
        `${result.partnerCode}: ${result.status} batch=${result.batchId ?? '-'} records=${result.recordCount} file=${result.fileName ?? '-'}`,
      )
    }
    return results.every((r) => r.status !== 'FAILED')
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
