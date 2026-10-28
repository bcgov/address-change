import { readFile } from 'node:fs/promises'
import { posix } from 'node:path'
import { Injectable, Logger } from '@nestjs/common'
import SftpClient from 'ssh2-sftp-client'
import type { PartnerSystem } from '../../generated/prisma/client.js'
import { decryptSecret, loadCredentialKey } from './sftp-credential.crypto'

export class SftpNotConfiguredError extends Error {
  readonly code = 'SFTP_NOT_CONFIGURED'
}

export type SftpConnectOptions = {
  host: string
  port: number
  username: string
  password?: string
  privateKey?: Buffer
}

export type SftpTarget = { options: SftpConnectOptions; remoteDir: string; remotePath: string }

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
    // Each partner gets its own folder under the configured directory, e.g. /inbound/ICBC.
    const remoteDir = posix.join(sftpRemoteDirectory, partner.partnerCode)
    return { options, remoteDir, remotePath: posix.join(remoteDir, fileName) }
  }

  async upload(partner: PartnerSftpSettings, fileName: string, content: Buffer): Promise<string> {
    const target = await this.resolveTarget(partner, fileName)
    this.logger.log(`Uploading ${fileName} to ${target.options.host}:${target.remotePath}`)
    const client = new SftpClient()
    try {
      await client.connect(target.options)
      if (!(await client.exists(target.remoteDir))) {
        await client.mkdir(target.remoteDir, true)
      }
      await client.put(content, target.remotePath)
    } finally {
      // end() rejects when connect() never succeeded; keep the original error.
      await client.end().catch(() => undefined)
    }
    return target.remotePath
  }
}
