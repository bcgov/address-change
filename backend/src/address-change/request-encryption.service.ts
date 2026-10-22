import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { Injectable, ServiceUnavailableException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

type Envelope = { v: number; keyId: string; iv: string; tag: string; ciphertext: string }

@Injectable()
export class RequestEncryptionService {
  constructor(private readonly config: ConfigService) {}

  private key(keyId: string): Buffer {
    const keys: Record<string, unknown> = JSON.parse(
      this.config.get<string>('ADDRESS_CHANGE_ENCRYPTION_KEYS') ?? '{}',
    )
    const encoded = Object.hasOwn(keys, keyId) ? keys[keyId] : undefined
    if (typeof encoded !== 'string') throw new Error('Missing key')
    const key = Buffer.from(encoded, 'base64')
    if (key.length !== 32 || key.toString('base64') !== encoded) throw new Error('Invalid key')
    return key
  }

  encrypt(value: string, context: string): Buffer {
    try {
      const keyId = this.config.get<string>('ADDRESS_CHANGE_ENCRYPTION_KEY_ID')
      if (!keyId) throw new Error('Missing key ID')
      const iv = randomBytes(12)
      const cipher = createCipheriv('aes-256-gcm', this.key(keyId), iv)
      cipher.setAAD(Buffer.from(`acbc:v1:${keyId}:${context}`, 'utf8'))
      const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
      const envelope: Envelope = {
        v: 1,
        keyId,
        iv: iv.toString('base64'),
        tag: cipher.getAuthTag().toString('base64'),
        ciphertext: ciphertext.toString('base64'),
      }
      return Buffer.from(JSON.stringify(envelope), 'utf8')
    } catch {
      throw new ServiceUnavailableException('Request encryption is unavailable')
    }
  }

  decrypt(value: Uint8Array, context: string): string {
    try {
      const envelope: Envelope = JSON.parse(Buffer.from(value).toString('utf8'))
      if (envelope.v !== 1) throw new Error('Unsupported envelope')
      const iv = Buffer.from(envelope.iv, 'base64')
      const tag = Buffer.from(envelope.tag, 'base64')
      if (iv.length !== 12 || tag.length !== 16) throw new Error('Invalid envelope')
      const cipher = createDecipheriv('aes-256-gcm', this.key(envelope.keyId), iv)
      cipher.setAAD(Buffer.from(`acbc:v1:${envelope.keyId}:${context}`, 'utf8'))
      cipher.setAuthTag(tag)
      return Buffer.concat([
        cipher.update(Buffer.from(envelope.ciphertext, 'base64')),
        cipher.final(),
      ]).toString('utf8')
    } catch {
      throw new ServiceUnavailableException('Stored request cannot be read securely')
    }
  }
}
