import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { Injectable } from '@nestjs/common'

export class S3NotConfiguredError extends Error {
  readonly code = 'S3_NOT_CONFIGURED'
}

@Injectable()
export class S3Transport {
  private client?: S3Client

  async upload(
    partnerCode: string,
    fileName: string,
    content: Buffer,
    checksum: string,
  ): Promise<string> {
    const bucket = process.env.FLAT_FILE_S3_BUCKET
    if (!bucket) throw new S3NotConfiguredError('FLAT_FILE_S3_BUCKET is not configured')

    const objectKey = `flat-files/${encodeURIComponent(partnerCode)}/${fileName}`
    if (!this.client) {
      this.client = new S3Client({
        region: process.env.AWS_REGION || 'ca-central-1',
        ...(process.env.FLAT_FILE_S3_ENDPOINT
          ? { endpoint: process.env.FLAT_FILE_S3_ENDPOINT, forcePathStyle: true }
          : {}),
      })
    }
    const client = this.client
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: objectKey,
        Body: content,
        ContentType: 'application/octet-stream',
        ServerSideEncryption: 'AES256',
        Metadata: { sha256: checksum },
      }),
    )
    return objectKey
  }
}
