import { Module } from '@nestjs/common'
import { PrismaService } from '../prisma.service'
import { FlatFileService } from './flat-file.service'
import { SftpTransport } from './sftp.transport'

@Module({
  providers: [PrismaService, FlatFileService, SftpTransport],
  exports: [FlatFileService],
})
export class FlatFileModule {}
