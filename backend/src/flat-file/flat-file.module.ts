import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { RequestEncryptionService } from '../address-change/request-encryption.service'
import { PrismaService } from '../prisma.service'
import { FlatFileService } from './flat-file.service'
import { SftpTransport } from './sftp.transport'

@Module({
  imports: [ConfigModule.forRoot({ envFilePath: ['.env.local', '.env'] })],
  providers: [PrismaService, FlatFileService, SftpTransport, RequestEncryptionService],
  exports: [FlatFileService],
})
export class FlatFileModule {}
