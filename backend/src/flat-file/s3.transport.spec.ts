const sdk = vi.hoisted(() => ({
  send: vi.fn(),
  clientConfigs: [] as Record<string, unknown>[],
}))

vi.mock('@aws-sdk/client-s3', () => {
  class S3Client {
    constructor(config: Record<string, unknown>) {
      sdk.clientConfigs.push(config)
    }

    send(command: unknown) {
      return sdk.send(command)
    }
  }
  class PutObjectCommand {
    constructor(readonly input: Record<string, unknown>) {}
  }
  class GetObjectCommand {
    constructor(readonly input: Record<string, unknown>) {}
  }
  class DeleteObjectCommand {
    constructor(readonly input: Record<string, unknown>) {}
  }
  return { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand }
})

import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { S3NotConfiguredError, S3Transport } from './s3.transport'

describe('S3Transport', () => {
  beforeEach(() => {
    sdk.send.mockReset()
    sdk.clientConfigs.length = 0
    vi.stubEnv('FLAT_FILE_S3_BUCKET', 'test-bucket')
    vi.stubEnv('AWS_REGION', 'test-region')
    vi.stubEnv('FLAT_FILE_S3_ENDPOINT', 'https://objects.example.test:443/')
  })

  afterEach(() => vi.unstubAllEnvs())

  it('uploads with the address_change prefix and configured endpoint', async () => {
    sdk.send.mockResolvedValue({})
    const transport = new S3Transport()
    const content = Buffer.from('payload')

    await expect(transport.upload('Health / MSP', 'daily.txt', content, 'sha256')).resolves.toBe(
      'address_change/flat-files/Health%20%2F%20MSP/daily.txt',
    )

    expect(sdk.clientConfigs).toEqual([
      {
        region: 'test-region',
        endpoint: 'https://objects.example.test:443/',
        forcePathStyle: true,
      },
    ])
    expect(sdk.send).toHaveBeenCalledOnce()
    const command = sdk.send.mock.calls[0]?.[0] as PutObjectCommand
    expect(command).toBeInstanceOf(PutObjectCommand)
    expect(command.input).toMatchObject({
      Bucket: 'test-bucket',
      Key: 'address_change/flat-files/Health%20%2F%20MSP/daily.txt',
      Body: content,
      ServerSideEncryption: 'AES256',
      Metadata: { sha256: 'sha256' },
    })
  })

  it('uses the default region and endpoint-free client config', async () => {
    vi.stubEnv('AWS_REGION', '')
    vi.stubEnv('FLAT_FILE_S3_ENDPOINT', '')
    sdk.send.mockResolvedValue({})

    await new S3Transport().upload('ICBC', 'file.txt', Buffer.from('x'), 'sum')

    expect(sdk.clientConfigs).toEqual([{ region: 'ca-central-1' }])
  })

  it('rejects upload without a configured bucket', async () => {
    vi.stubEnv('FLAT_FILE_S3_BUCKET', '  ')

    await expect(
      new S3Transport().upload('ICBC', 'file.txt', Buffer.from('x'), 'sum'),
    ).rejects.toBeInstanceOf(S3NotConfiguredError)
    expect(sdk.send).not.toHaveBeenCalled()
  })

  it('downloads the response body as a Buffer', async () => {
    const payload = new Uint8Array([1, 2, 3])
    sdk.send.mockResolvedValue({ Body: { transformToByteArray: async () => payload } })

    await expect(new S3Transport().download('address_change/test.txt')).resolves.toEqual(
      Buffer.from(payload),
    )
    const command = sdk.send.mock.calls[0]?.[0] as GetObjectCommand
    expect(command).toBeInstanceOf(GetObjectCommand)
    expect(command.input).toEqual({ Bucket: 'test-bucket', Key: 'address_change/test.txt' })
  })

  it('rejects an empty download response body', async () => {
    sdk.send.mockResolvedValue({ Body: undefined })

    await expect(new S3Transport().download('missing.txt')).rejects.toThrow(
      'S3 returned an empty body for missing.txt',
    )
  })

  it('deletes an object from the configured bucket', async () => {
    sdk.send.mockResolvedValue({})

    await expect(new S3Transport().delete('address_change/test.txt')).resolves.toBeUndefined()
    const command = sdk.send.mock.calls[0]?.[0] as DeleteObjectCommand
    expect(command).toBeInstanceOf(DeleteObjectCommand)
    expect(command.input).toEqual({ Bucket: 'test-bucket', Key: 'address_change/test.txt' })
  })
})
