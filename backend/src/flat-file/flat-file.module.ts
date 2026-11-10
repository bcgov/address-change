import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { RequestEncryptionService } from '../address-change/request-encryption.service'
import { PrismaService } from '../prisma.service'
import { FlatFileService } from './flat-file.service'
import { S3Transport } from './s3.transport'
import { SftpTransport } from './sftp.transport'

@Module({
  imports: [ConfigModule.forRoot({ ignoreEnvFile: true })],
  providers: [PrismaService, RequestEncryptionService, FlatFileService, SftpTransport, S3Transport],
  exports: [FlatFileService],
})
export class FlatFileModule {}
