import { randomBytes } from 'node:crypto'
import { SFTP_CREDENTIAL_KEY_ENV, encryptSecret } from './sftp-credential.crypto'
import { SftpNotConfiguredError, SftpTransport } from './sftp.transport'

const key = randomBytes(32)
const partner = {
  partnerCode: 'ICBC',
  sftpHost: 'localhost',
  sftpPort: 2222,
  sftpUsername: 'sample-icbc',
  sftpAuthMethod: 'PASSWORD',
  sftpEncryptedPassword: encryptSecret('localpass', key),
  sftpKeyPath: null,
  sftpRemoteDirectory: '/inbound',
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
    expect(target.options).toEqual({
      host: 'localhost',
      port: 2222,
      username: 'sample-icbc',
      password: 'localpass',
    })
  })

  it('rejects partners without complete SFTP settings', async () => {
    await expect(
      new SftpTransport().resolveTarget({ ...partner, sftpHost: null }, 'f.txt'),
    ).rejects.toBeInstanceOf(SftpNotConfiguredError)
  })
})
