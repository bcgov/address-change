import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { Injectable } from '@nestjs/common'

export class S3NotConfiguredError extends Error {
  readonly code = 'S3_NOT_CONFIGURED'
}

@Injectable()
export class S3Transport {
  private client?: S3Client

  private getClient(): S3Client {
    if (!this.client) {
      this.client = new S3Client({
        region: process.env.AWS_REGION || 'ca-central-1',
        ...(process.env.FLAT_FILE_S3_ENDPOINT
          ? { endpoint: process.env.FLAT_FILE_S3_ENDPOINT, forcePathStyle: true }
          : {}),
      })
    }
    return this.client
  }

  private getBucket(): string {
    const bucket = process.env.FLAT_FILE_S3_BUCKET?.trim()
    if (!bucket) throw new S3NotConfiguredError('FLAT_FILE_S3_BUCKET is not configured')
    return bucket
  }

  async upload(
    partnerCode: string,
    fileName: string,
    content: Buffer,
    checksum: string,
  ): Promise<string> {
    const bucket = this.getBucket()

    const objectKey = `flat-files/${encodeURIComponent(partnerCode)}/${fileName}`
    await this.getClient().send(
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

  async download(objectKey: string): Promise<Buffer> {
    const response = await this.getClient().send(
      new GetObjectCommand({ Bucket: this.getBucket(), Key: objectKey }),
    )
    if (!response.Body) throw new Error(`S3 returned an empty body for ${objectKey}`)
    return Buffer.from(await response.Body.transformToByteArray())
  }

  async delete(objectKey: string): Promise<void> {
    await this.getClient().send(
      new DeleteObjectCommand({ Bucket: this.getBucket(), Key: objectKey }),
    )
  }
}
