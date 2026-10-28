import { randomBytes } from 'node:crypto'
import {
  SFTP_CREDENTIAL_KEY_ENV,
  decryptSecret,
  encryptSecret,
  loadCredentialKey,
} from './sftp-credential.crypto'

describe('sftp credential crypto', () => {
  const key = randomBytes(32)

  it('round-trips a password', () => {
    const envelope = encryptSecret('s3cret-pässword', key)
    expect(envelope[0]).toBe(0x01)
    expect(decryptSecret(envelope, key)).toBe('s3cret-pässword')
  })

  it('uses a fresh nonce for every encryption', () => {
    expect(encryptSecret('same', key).equals(encryptSecret('same', key))).toBe(false)
  })

  it('rejects a tampered envelope or wrong key', () => {
    const envelope = encryptSecret('secret', key)
    envelope[envelope.length - 1] ^= 0xff
    expect(() => decryptSecret(envelope, key)).toThrow()
    expect(() => decryptSecret(encryptSecret('secret', key), randomBytes(32))).toThrow()
  })

  it('rejects unknown envelope versions', () => {
    const envelope = encryptSecret('secret', key)
    envelope[0] = 0x02
    expect(() => decryptSecret(envelope, key)).toThrow('Unsupported credential envelope')
  })

  it('loads a 32-byte base64 key and reports missing or invalid keys', () => {
    expect(
      loadCredentialKey({ [SFTP_CREDENTIAL_KEY_ENV]: key.toString('base64') }).equals(key),
    ).toBe(true)
    expect(() => loadCredentialKey({})).toThrow(`${SFTP_CREDENTIAL_KEY_ENV} is not set`)
    expect(() =>
      loadCredentialKey({ [SFTP_CREDENTIAL_KEY_ENV]: randomBytes(16).toString('base64') }),
    ).toThrow('exactly 32 bytes')
  })
})
