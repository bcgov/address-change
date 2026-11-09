import { randomBytes } from 'node:crypto'
import SftpClient from 'ssh2-sftp-client'
import { SFTP_CREDENTIAL_KEY_ENV, encryptSecret } from './sftp-credential.crypto'
import {
  SFTP_ALLOW_UNVERIFIED_HOST_KEY_ENV,
  SftpNotConfiguredError,
  SftpRemoteFileConflictError,
  SftpTransport,
  toSshFingerprint,
} from './sftp.transport'

vi.mock('ssh2-sftp-client')

const key = randomBytes(32)
const hostHash = randomBytes(32).toString('hex')
const fingerprint = toSshFingerprint(hostHash)
const partner = {
  partnerCode: 'ICBC',
  sftpHost: 'localhost',
  sftpPort: 2222,
  sftpUsername: 'sample-icbc',
  sftpAuthMethod: 'PASSWORD',
  sftpEncryptedPassword: encryptSecret('localpass', key),
  sftpKeyPath: null,
  sftpRemoteDirectory: '/inbound',
  sftpHostKeyFingerprints: `SHA256:${'A'.repeat(43)},${fingerprint}`,
  sftpUseTempFile: true,
}

describe('SftpTransport.resolveTarget', () => {
  beforeEach(() => {
    vi.stubEnv(SFTP_CREDENTIAL_KEY_ENV, key.toString('base64'))
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('places files in a per-partner folder and decrypts the password', async () => {
    const target = await new SftpTransport().resolveTarget(partner, '20250516191024.txt')

    expect(target.remoteDir).toBe('/inbound/ICBC')
    expect(target.remotePath).toBe('/inbound/ICBC/20250516191024.txt')
    expect(target.options).toMatchObject({
      host: 'localhost',
      port: 2222,
      username: 'sample-icbc',
      password: 'localpass',
    })
  })

  it('accepts any pinned fingerprint and rejects others', async () => {
    const { options } = await new SftpTransport().resolveTarget(partner, 'f.txt')

    expect(options.hostHash).toBe('sha256')
    expect(options.hostVerifier?.(hostHash)).toBe(true)
    expect(options.hostVerifier?.(randomBytes(32).toString('hex'))).toBe(false)
  })

  it('flags a host key mismatch', async () => {
    const target = await new SftpTransport().resolveTarget(partner, 'f.txt')

    target.options.hostVerifier?.(randomBytes(32).toString('hex'))

    expect(target.hostKeyMismatch()).toBe(true)
  })

  it('refuses to connect without a pinned fingerprint', async () => {
    await expect(
      new SftpTransport().resolveTarget({ ...partner, sftpHostKeyFingerprints: null }, 'f.txt'),
    ).rejects.toBeInstanceOf(SftpNotConfiguredError)
  })

  it('skips verification only when explicitly allowed', async () => {
    vi.stubEnv(SFTP_ALLOW_UNVERIFIED_HOST_KEY_ENV, 'true')

    const { options } = await new SftpTransport().resolveTarget(
      { ...partner, sftpHostKeyFingerprints: null },
      'f.txt',
    )

    expect(options.hostVerifier).toBeUndefined()
  })

  it('rejects partners without complete SFTP settings', async () => {
    await expect(
      new SftpTransport().resolveTarget({ ...partner, sftpHost: null }, 'f.txt'),
    ).rejects.toBeInstanceOf(SftpNotConfiguredError)
  })
})

describe('SftpTransport.upload', () => {
  const content = Buffer.from('hello')
  const remotePath = '/inbound/ICBC/f.txt'

  function fakeClient(remote: Record<string, string> = {}, size = content.length) {
    const fake = {
      connect: vi.fn(),
      exists: vi.fn(async (path: string) => remote[path] ?? false),
      mkdir: vi.fn(),
      stat: vi.fn(async () => ({ size })),
      put: vi.fn(),
      rename: vi.fn(),
      end: vi.fn().mockResolvedValue(undefined),
    }
    // biome-ignore lint/complexity/useArrowFunction: the mock is invoked with `new`
    vi.mocked(SftpClient).mockImplementation(function () {
      return fake
    } as never)
    return fake
  }

  beforeEach(() => {
    vi.stubEnv(SFTP_CREDENTIAL_KEY_ENV, key.toString('base64'))
    vi.stubEnv(SFTP_ALLOW_UNVERIFIED_HOST_KEY_ENV, 'true')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('uploads to a .part file and renames it when complete', async () => {
    const client = fakeClient({ '/inbound/ICBC': 'd' })

    await expect(new SftpTransport().upload(partner, 'f.txt', content)).resolves.toBe(remotePath)

    expect(client.put).toHaveBeenCalledWith(content, `${remotePath}.part`)
    expect(client.rename).toHaveBeenCalledWith(`${remotePath}.part`, remotePath)
  })

  it('does not resend when the final file already exists with the same size', async () => {
    const client = fakeClient({ '/inbound/ICBC': 'd', [remotePath]: '-' })

    await expect(new SftpTransport().upload(partner, 'f.txt', content)).resolves.toBe(remotePath)

    expect(client.put).not.toHaveBeenCalled()
    expect(client.rename).not.toHaveBeenCalled()
  })

  it('refuses to overwrite an existing file of a different size', async () => {
    const client = fakeClient({ '/inbound/ICBC': 'd', [remotePath]: '-' }, content.length + 1)

    await expect(new SftpTransport().upload(partner, 'f.txt', content)).rejects.toBeInstanceOf(
      SftpRemoteFileConflictError,
    )
    expect(client.put).not.toHaveBeenCalled()
  })

  it('uploads straight to the final name, overwriting, when temp files are disabled', async () => {
    const client = fakeClient({ '/inbound/ICBC': 'd', [remotePath]: '-' })

    await new SftpTransport().upload({ ...partner, sftpUseTempFile: false }, 'f.txt', content)

    expect(client.put).toHaveBeenCalledWith(content, remotePath)
    expect(client.exists).not.toHaveBeenCalledWith(remotePath)
    expect(client.rename).not.toHaveBeenCalled()
  })
})
