import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

// Provided by an OpenShift secret; base64 encoding of exactly 32 random bytes.
export const SFTP_CREDENTIAL_KEY_ENV = 'SFTP_CREDENTIAL_ENCRYPTION_KEY'

const ENVELOPE_VERSION = 0x01
const IV_LENGTH = 12
const TAG_LENGTH = 16
const HEADER_LENGTH = 1 + IV_LENGTH + TAG_LENGTH

export function loadCredentialKey(env: NodeJS.ProcessEnv = process.env): Buffer {
  const encoded = env[SFTP_CREDENTIAL_KEY_ENV]
  if (!encoded) {
    throw new Error(`${SFTP_CREDENTIAL_KEY_ENV} is not set`)
  }
  const key = Buffer.from(encoded, 'base64')
  if (key.length !== 32) {
    throw new Error(`${SFTP_CREDENTIAL_KEY_ENV} must be base64 for exactly 32 bytes`)
  }
  return key
}

// Envelope layout: version (1) | iv (12) | auth tag (16) | ciphertext.
export function encryptSecret(plaintext: string, key: Buffer): Buffer {
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return Buffer.concat([Buffer.from([ENVELOPE_VERSION]), iv, cipher.getAuthTag(), ciphertext])
}

export function decryptSecret(envelope: Uint8Array, key: Buffer): string {
  const data = Buffer.from(envelope)
  if (data.length <= HEADER_LENGTH || data[0] !== ENVELOPE_VERSION) {
    throw new Error('Unsupported credential envelope')
  }
  const iv = data.subarray(1, 1 + IV_LENGTH)
  const tag = data.subarray(1 + IV_LENGTH, HEADER_LENGTH)
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(data.subarray(HEADER_LENGTH)), decipher.final()]).toString(
    'utf8',
  )
}
