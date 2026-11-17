import { Logger } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { runFlatFileJob } from './flat-file.job'
import { FlatFileModule } from './flat-file.module'
import { FlatFileService } from './flat-file.service'

type ApplicationContext = {
  enableShutdownHooks(): void
  get<T>(token: new (...args: never[]) => T): T
  close(): Promise<void>
}

export async function executeFlatFileJob(
  createApplicationContext: () => Promise<ApplicationContext>,
  logger = new Logger('FlatFileJob'),
): Promise<boolean> {
  let app: ApplicationContext | undefined
  try {
    app = await createApplicationContext()
    app.enableShutdownHooks()
    return await runFlatFileJob(app.get(FlatFileService))
  } catch (err) {
    logger.error((err as Error).message)
    return false
  } finally {
    await app?.close()
  }
}

export async function startFlatFileCli(
  execute: () => Promise<boolean>,
  setExitCode: (code: number) => void,
  logger: Pick<Logger, 'error'>,
): Promise<void> {
  try {
    setExitCode((await execute()) ? 0 : 1)
  } catch (err) {
    logger.error((err as Error).message)
    setExitCode(1)
  }
}

/* v8 ignore next -- only execute the CLI when Node loads this file directly. */
if (require.main === module) {
  void startFlatFileCli(
    () => executeFlatFileJob(() => NestFactory.createApplicationContext(FlatFileModule)),
    (code) => {
      process.exitCode = code
    },
    new Logger('FlatFileJob'),
  )
}
