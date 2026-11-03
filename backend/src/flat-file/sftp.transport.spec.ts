import { randomBytes } from 'node:crypto'
import { SFTP_CREDENTIAL_KEY_ENV, encryptSecret } from './sftp-credential.crypto'
import {
  SFTP_ALLOW_UNVERIFIED_HOST_KEY_ENV,
  SftpNotConfiguredError,
  SftpTransport,
  toSshFingerprint,
} from './sftp.transport'

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
