import { Module } from '@nestjs/common'
import { S3Transport } from '../flat-file/s3.transport'
import { PrismaService } from '../prisma.service'
import { RetentionService } from './retention.service'

@Module({
  providers: [PrismaService, S3Transport, RetentionService],
  exports: [RetentionService],
})
export class RetentionModule {}
