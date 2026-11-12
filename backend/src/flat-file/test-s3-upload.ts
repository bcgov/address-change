import { createHash, randomUUID } from 'node:crypto'
import { S3Transport } from './s3.transport'

export async function uploadTestFile(
  transport: Pick<S3Transport, 'upload'> = new S3Transport(),
): Promise<string> {
  const content = Buffer.from('Address Change S3 connectivity test.\r\n', 'utf8')
  const fileName = `s3_test_${randomUUID()}.txt`
  return transport.upload(
    'connectivity-test',
    fileName,
    content,
    createHash('sha256').update(content).digest('hex'),
  )
}

if (require.main === module) {
  uploadTestFile()
    .then((objectKey) => {
      console.log(`Test file uploaded: s3://${process.env.FLAT_FILE_S3_BUCKET}/${objectKey}`)
    })
    .catch((err: Error) => {
      console.error(`S3 test upload failed: ${err.message}`)
      process.exitCode = 1
    })
}
