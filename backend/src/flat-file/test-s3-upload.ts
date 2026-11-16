import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { S3Transport } from './s3.transport'

type S3RoundTripTransport = Pick<S3Transport, 'upload' | 'download' | 'delete'>
type TestOutput = Pick<Console, 'log' | 'error'>

export async function uploadTestFile(transport: S3RoundTripTransport): Promise<string> {
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

export async function runS3TestCli(
  transport: S3RoundTripTransport,
  output: TestOutput,
  setExitCode: (code: number) => void,
): Promise<void> {
  try {
    const objectKey = await uploadTestFile(transport)
    output.log(
      `S3 upload/download verification succeeded and test object was deleted: s3://${process.env.FLAT_FILE_S3_BUCKET}/${objectKey}`,
    )
    setExitCode(0)
  } catch (err) {
    output.error(`S3 test upload failed: ${(err as Error).message}`)
    setExitCode(1)
  }
}

/* v8 ignore next -- only execute the CLI when Node loads this file directly. */
if (require.main === module) {
  void runS3TestCli(new S3Transport(), console, (code) => {
    process.exitCode = code
  })
}
