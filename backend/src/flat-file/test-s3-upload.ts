import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { S3Transport } from './s3.transport'

type S3RoundTripTransport = Pick<S3Transport, 'upload' | 'download' | 'delete'>

export async function uploadTestFile(
  transport: S3RoundTripTransport = new S3Transport(),
): Promise<string> {
  const content = Buffer.from(`${randomBytes(32).toString('hex')}\r\n`, 'utf8')
  const fileName = `s3_test_${randomUUID()}.txt`
  const objectKey = await transport.upload(
    'connectivity-test',
    fileName,
    content,
    createHash('sha256').update(content).digest('hex'),
  )
  try {
    const downloaded = await transport.download(objectKey)
    if (!downloaded.equals(content)) {
      throw new Error(`S3 test content mismatch for ${objectKey}`)
    }
    return objectKey
  } finally {
    await transport.delete(objectKey)
  }
}

if (require.main === module) {
  uploadTestFile()
    .then((objectKey) => {
      console.log(
        `S3 upload/download verification succeeded and test object was deleted: s3://${process.env.FLAT_FILE_S3_BUCKET}/${objectKey}`,
      )
    })
    .catch((err: Error) => {
      console.error(`S3 test upload failed: ${err.message}`)
      process.exitCode = 1
    })
}
