import { randomBytes } from 'node:crypto'
import { ConfigService } from '@nestjs/config'
import { ServiceUnavailableException } from '@nestjs/common'
import { RequestEncryptionService } from './request-encryption.service'

describe('RequestEncryptionService', () => {
  const oldKey = randomBytes(32).toString('base64')
  const newKey = randomBytes(32).toString('base64')
  const create = (keyId = 'old', keys: unknown = { old: oldKey }) =>
    new RequestEncryptionService(
      new ConfigService({
        ADDRESS_CHANGE_ENCRYPTION_KEY_ID: keyId,
        ADDRESS_CHANGE_ENCRYPTION_KEYS: JSON.stringify(keys),
      }),
    )
  it('round-trips UTF-8 with a fresh nonce for every encryption', () => {
    const service = create()
    const plaintext = 'Sḵwx̱wú7mesh ᐊᓂᔑᓈᐯ'
    const first = service.encrypt(plaintext, 'request:1:payload')
    const second = service.encrypt(plaintext, 'request:1:payload')
    expect(first.equals(second)).toBe(false)
    expect(first.toString()).not.toContain(plaintext)
    expect(service.decrypt(first, 'request:1:payload')).toBe(plaintext)
  })
  it('rejects swapped rows/fields and tampered ciphertext', () => {
    const service = create()
    const encrypted = service.encrypt('secret', 'request:1:phn')
    expect(() => service.decrypt(encrypted, 'request:2:phn')).toThrow(ServiceUnavailableException)
    expect(() => service.decrypt(encrypted, 'request:1:payload')).toThrow(
      ServiceUnavailableException,
    )
    const envelope = JSON.parse(encrypted.toString())
    envelope.ciphertext = Buffer.from('changed').toString('base64')
    expect(() => service.decrypt(Buffer.from(JSON.stringify(envelope)), 'request:1:phn')).toThrow(
      ServiceUnavailableException,
    )
  })
  it('reads retained requests after key rotation without using the old key for new writes', () => {
    const encrypted = create().encrypt('secret', 'request:1:payload')
    const rotated = create('new', { old: oldKey, new: newKey })
    expect(rotated.decrypt(encrypted, 'request:1:payload')).toBe('secret')
    expect(JSON.parse(rotated.encrypt('next', 'request:2:payload').toString()).keyId).toBe('new')
    expect(() => create('new', { new: newKey }).decrypt(encrypted, 'request:1:payload')).toThrow(
      ServiceUnavailableException,
    )
  })
  it.each([{}, { old: 'not-a-key' }, null])(
    'fails closed for missing/invalid key configuration',
    (keys) => {
      expect(() => create('old', keys).encrypt('never plaintext', 'request:1:payload')).toThrow(
        ServiceUnavailableException,
      )
    },
  )
})
