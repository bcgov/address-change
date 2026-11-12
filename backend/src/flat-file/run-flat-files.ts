import { Logger } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { runFlatFileJob } from './flat-file.job'
import { FlatFileModule } from './flat-file.module'
import { FlatFileService } from './flat-file.service'

async function main(): Promise<boolean> {
  const app = await NestFactory.createApplicationContext(FlatFileModule)
  app.enableShutdownHooks()
  try {
    return await runFlatFileJob(app.get(FlatFileService))
  } finally {
    await app.close()
  }
}

main()
  .then((ok) => {
    process.exitCode = ok ? 0 : 1
  })
  .catch((err: Error) => {
    new Logger('FlatFileJob').error(err.message)
    process.exitCode = 1
  })
