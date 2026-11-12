import { createHash } from 'node:crypto'
import { uploadTestFile } from './test-s3-upload'

describe('uploadTestFile', () => {
  it('uploads synthetic text with a unique filename and matching checksum', async () => {
    const upload = vi.fn().mockResolvedValue('flat-files/connectivity-test/test.txt')
    await expect(uploadTestFile({ upload })).resolves.toBe('flat-files/connectivity-test/test.txt')
    const content = Buffer.from('Address Change S3 connectivity test.\r\n', 'utf8')
    expect(upload).toHaveBeenCalledWith(
      'connectivity-test',
      expect.stringMatching(/^s3_test_[a-f0-9-]+\.txt$/),
      content,
      createHash('sha256').update(content).digest('hex'),
    )
  })

  it('propagates upload failures', async () => {
    const upload = vi.fn().mockRejectedValue(new Error('bucket unavailable'))
    await expect(uploadTestFile({ upload })).rejects.toThrow('bucket unavailable')
  })
})
