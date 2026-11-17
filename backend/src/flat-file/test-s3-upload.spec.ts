import { createHash } from 'node:crypto'
import { runS3TestCli, uploadTestFile } from './test-s3-upload'

describe('uploadTestFile', () => {
  it('uploads random text, downloads and verifies it, then deletes the test object', async () => {
    const upload = vi.fn().mockResolvedValue('address_change/flat-files/connectivity-test/test.txt')
    const download = vi.fn(async () => upload.mock.calls[0]?.[2] as Buffer)
    const remove = vi.fn().mockResolvedValue(undefined)
    await expect(uploadTestFile({ upload, download, delete: remove })).resolves.toBe(
      'address_change/flat-files/connectivity-test/test.txt',
    )
    const content = upload.mock.calls[0]?.[2] as Buffer
    expect(content.toString()).toMatch(/^[a-f0-9]{64}\r\n$/)
    expect(upload).toHaveBeenCalledWith(
      'connectivity-test',
      expect.stringMatching(/^s3_test_[a-f0-9-]+\.txt$/),
      content,
      createHash('sha256').update(content).digest('hex'),
    )
    expect(download).toHaveBeenCalledWith('address_change/flat-files/connectivity-test/test.txt')
    expect(remove).toHaveBeenCalledWith('address_change/flat-files/connectivity-test/test.txt')
  })

  it('deletes the uploaded object if download fails', async () => {
    const upload = vi.fn().mockResolvedValue('test-object')
    const download = vi.fn().mockRejectedValue(new Error('download failed'))
    const remove = vi.fn().mockResolvedValue(undefined)
    await expect(uploadTestFile({ upload, download, delete: remove })).rejects.toThrow(
      'download failed',
    )
    expect(remove).toHaveBeenCalledWith('test-object')
  })

  it('reports a content mismatch and still deletes the object', async () => {
    const upload = vi.fn().mockResolvedValue('test-object')
    const download = vi.fn().mockResolvedValue(Buffer.from('different'))
    const remove = vi.fn().mockResolvedValue(undefined)
    await expect(uploadTestFile({ upload, download, delete: remove })).rejects.toThrow(
      'content mismatch',
    )
    expect(remove).toHaveBeenCalledWith('test-object')
  })

  it('propagates upload failures without attempting download or delete', async () => {
    const upload = vi.fn().mockRejectedValue(new Error('bucket unavailable'))
    const download = vi.fn()
    const remove = vi.fn()
    await expect(uploadTestFile({ upload, download, delete: remove })).rejects.toThrow(
      'bucket unavailable',
    )
    expect(download).not.toHaveBeenCalled()
    expect(remove).not.toHaveBeenCalled()
  })

  it('prints the verified object URI and succeeds from the CLI', async () => {
    vi.stubEnv('FLAT_FILE_S3_BUCKET', 'test-bucket')
    const upload = vi.fn().mockResolvedValue('address_change/test.txt')
    const download = vi.fn(async () => upload.mock.calls[0]?.[2] as Buffer)
    const remove = vi.fn().mockResolvedValue(undefined)
    const output = { log: vi.fn(), error: vi.fn() }
    const setExitCode = vi.fn()

    await runS3TestCli({ upload, download, delete: remove }, output, setExitCode)

    expect(output.log).toHaveBeenCalledWith(
      'S3 upload/download verification succeeded and test object was deleted: s3://test-bucket/address_change/test.txt',
    )
    expect(setExitCode).toHaveBeenCalledWith(0)
    vi.unstubAllEnvs()
  })

  it('reports CLI errors and sets a failing exit code', async () => {
    const output = { log: vi.fn(), error: vi.fn() }
    const setExitCode = vi.fn()

    await runS3TestCli(
      {
        upload: vi.fn().mockRejectedValue(new Error('bucket unavailable')),
        download: vi.fn(),
        delete: vi.fn(),
      },
      output,
      setExitCode,
    )

    expect(output.error).toHaveBeenCalledWith('S3 test upload failed: bucket unavailable')
    expect(setExitCode).toHaveBeenCalledWith(1)
  })
})
