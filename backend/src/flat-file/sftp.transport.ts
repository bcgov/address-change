import { createHash, timingSafeEqual } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { posix } from 'node:path'
import { Injectable, Logger } from '@nestjs/common'
import SftpClient from 'ssh2-sftp-client'
import type { PartnerSystem } from '../../generated/prisma/client.js'
import { decryptSecret, loadCredentialKey } from './sftp-credential.crypto'

export class SftpNotConfiguredError extends Error {
  readonly code = 'SFTP_NOT_CONFIGURED'
}

export class SftpHostKeyMismatchError extends Error {
  readonly code = 'SFTP_HOST_KEY_MISMATCH'
}

export class SftpRemoteFileConflictError extends Error {
  readonly code = 'SFTP_REMOTE_FILE_CONFLICT'
}

// Local development only; never set in OpenShift.
export const SFTP_ALLOW_UNVERIFIED_HOST_KEY_ENV = 'SFTP_ALLOW_UNVERIFIED_HOST_KEY'

export type SftpConnectOptions = {
  host: string
  port: number
  username: string
  password?: string
  privateKey?: Buffer
  hostHash?: 'sha256'
  hostVerifier?: (hexHash: string) => boolean
}

export type SftpTarget = {
  options: SftpConnectOptions
  remoteDir: string
  remotePath: string
  hostKeyMismatch: () => boolean
}

// ssh2 reports the SHA-256 as hex; ssh-keygen style is unpadded base64 prefixed with SHA256:.
export function toSshFingerprint(hexHash: string): string {
  return `SHA256:${Buffer.from(hexHash, 'hex').toString('base64').replace(/=+$/, '')}`
}

function fingerprintMatches(actual: string, allowed: string[]): boolean {
  const a = createHash('sha256').update(actual).digest()
  return allowed.reduce(
    (found, fp) => timingSafeEqual(a, createHash('sha256').update(fp).digest()) || found,
    false,
  )
}

type PartnerSftpSettings = Pick<
  PartnerSystem,
  | 'partnerCode'
  | 'sftpHost'
  | 'sftpPort'
  | 'sftpUsername'
  | 'sftpAuthMethod'
  | 'sftpEncryptedPassword'
  | 'sftpKeyPath'
  | 'sftpRemoteDirectory'
  | 'sftpHostKeyFingerprints'
  | 'sftpUseTempFile'
>

@Injectable()
export class SftpTransport {
  private readonly logger = new Logger(SftpTransport.name)

  async resolveTarget(partner: PartnerSftpSettings, fileName: string): Promise<SftpTarget> {
    const { sftpHost, sftpUsername, sftpRemoteDirectory, sftpAuthMethod } = partner
    if (!sftpHost || !sftpUsername || !sftpRemoteDirectory || !sftpAuthMethod) {
      throw new SftpNotConfiguredError(
        `SFTP settings incomplete for partner ${partner.partnerCode}`,
      )
    }
    const options: SftpConnectOptions = {
      host: sftpHost,
      port: partner.sftpPort,
      username: sftpUsername,
    }
    if (sftpAuthMethod === 'PASSWORD' && partner.sftpEncryptedPassword) {
      options.password = decryptSecret(partner.sftpEncryptedPassword, loadCredentialKey())
    } else if (sftpAuthMethod === 'PRIVATE_KEY' && partner.sftpKeyPath) {
      options.privateKey = await readFile(partner.sftpKeyPath)
    } else {
      throw new SftpNotConfiguredError(
        `SFTP credentials incomplete for partner ${partner.partnerCode}`,
      )
    }
    let mismatched = false
    if (process.env[SFTP_ALLOW_UNVERIFIED_HOST_KEY_ENV] !== 'true') {
      const allowed = (partner.sftpHostKeyFingerprints ?? '')
        .split(',')
        .map((fp) => fp.trim())
        .filter(Boolean)
      if (allowed.length === 0) {
        throw new SftpNotConfiguredError(
          `SFTP host key fingerprint missing for partner ${partner.partnerCode}`,
        )
      }
      options.hostHash = 'sha256'
      options.hostVerifier = (hexHash) => {
        const ok = fingerprintMatches(toSshFingerprint(hexHash), allowed)
        mismatched = !ok
        return ok
      }
    }
    // Each partner gets its own folder under the configured directory, e.g. /inbound/ICBC.
    const remoteDir = posix.join(sftpRemoteDirectory, partner.partnerCode)
    return {
      options,
      remoteDir,
      remotePath: posix.join(remoteDir, fileName),
      hostKeyMismatch: () => mismatched,
    }
  }

  async upload(partner: PartnerSftpSettings, fileName: string, content: Buffer): Promise<string> {
    const target = await this.resolveTarget(partner, fileName)
    this.logger.log(`Uploading ${fileName} to ${target.options.host}:${target.remotePath}`)
    const client = new SftpClient()
    try {
      try {
        await client.connect(target.options)
      } catch (err) {
        if (target.hostKeyMismatch()) {
          throw new SftpHostKeyMismatchError(
            `Host key of ${target.options.host} does not match the pinned fingerprint for partner ${partner.partnerCode}`,
          )
        }
        throw err
      }
      if (!(await client.exists(target.remoteDir))) {
        await client.mkdir(target.remoteDir, true)
      }
      if (partner.sftpUseTempFile) {
        // A file under the final name is always complete, so an equal-size match means it was already sent.
        const existing = await client.exists(target.remotePath)
        if (existing) {
          if (existing === '-' && (await client.stat(target.remotePath)).size === content.length) {
            this.logger.log(`${target.remotePath} already exists; not resending`)
            return target.remotePath
          }
          throw new SftpRemoteFileConflictError(
            `${target.remotePath} already exists and differs from this batch`,
          )
        }
        const partialPath = `${target.remotePath}.part`
        await client.put(content, partialPath)
        await client.rename(partialPath, target.remotePath)
      } else {
        await client.put(content, target.remotePath)
      }
    } finally {
      // end() rejects when connect() never succeeded; keep the original error.
      await client.end().catch(() => undefined)
    }
    return target.remotePath
  }
}
