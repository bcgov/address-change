import { readFile } from 'node:fs/promises'
import { posix } from 'node:path'
import { Injectable, Logger } from '@nestjs/common'
// import SftpClient from 'ssh2-sftp-client'
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

export type SftpTarget = { options: SftpConnectOptions; remotePath: string }

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
    return { options, remotePath: posix.join(sftpRemoteDirectory, fileName) }
  }

  async upload(partner: PartnerSftpSettings, fileName: string, _content: Buffer): Promise<void> {
    const target = await this.resolveTarget(partner, fileName)
    this.logger.log(`Uploading ${fileName} to ${target.options.host}:${target.remotePath}`)
    // Enable once real partner SFTP endpoints and credentials are provisioned.
    // const client = new SftpClient()
    // try {
    //   await client.connect(target.options)
    //   await client.put(_content, target.remotePath)
    // } finally {
    //   await client.end()
    // }
    throw new SftpNotConfiguredError('SFTP upload is not enabled yet')
  }
}
