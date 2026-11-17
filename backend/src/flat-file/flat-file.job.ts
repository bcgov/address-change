import { Logger } from '@nestjs/common'
import type { FlatFileService } from './flat-file.service'

export async function runFlatFileJob(
  service: Pick<FlatFileService, 'generateAll' | 'transferPending'>,
  logger = new Logger('FlatFileJob'),
): Promise<boolean> {
  let generated = false
  try {
    const results = await service.generateAll()
    generated = results.every((result) => result.status !== 'FAILED')
    for (const result of results) {
      logger.log(
        `${result.partnerCode}: ${result.status} batch=${result.batchId ?? '-'} file=${result.fileName ?? '-'}`,
      )
    }
  } catch (err) {
    logger.error(`Generation failed: ${(err as Error).message}`)
  }

  const transfers = await service.transferPending()
  for (const result of transfers) {
    logger.log(
      `${result.partnerCode}: ${result.status} batch=${result.batchId} sftp=${result.sftpStatus} s3=${result.s3Status}`,
    )
  }
  return generated && transfers.every((result) => result.status !== 'FAILED')
}
