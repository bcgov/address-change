import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { Injectable, Logger } from '@nestjs/common'
import { PrismaClient, Prisma } from '../generated/prisma/client.js'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

const PrismaClientWithLogs = PrismaClient as unknown as new (
  options?: Prisma.PrismaClientOptions,
) => PrismaClient<'query' | 'info' | 'warn' | 'error'>

@Injectable()
class PrismaService extends PrismaClientWithLogs implements OnModuleInit, OnModuleDestroy {
  private logger = new Logger('PRISMA')
  private static instance: PrismaService
  private pool!: Pool
  constructor() {
    if (PrismaService.instance) {
      return PrismaService.instance
    }
    const dbHost = process.env.POSTGRES_HOST || 'localhost'
    const dbUser = process.env.POSTGRES_USER || 'postgres'
    const dbPassword = encodeURIComponent(process.env.POSTGRES_PASSWORD || 'default')
    const dbPort = process.env.POSTGRES_PORT || 5432
    const dbName = process.env.POSTGRES_DATABASE || 'postgres'
    const dbSchema = process.env.POSTGRES_SCHEMA || 'address_change'
    const pgbouncerUrl = process.env.PGBOUNCER_URL
    const dataSourceURL = pgbouncerUrl
      ? `${pgbouncerUrl}?schema=${dbSchema}&pgbouncer=true`
      : `postgresql://${dbUser}:${dbPassword}@${dbHost}:${dbPort}/${dbName}?schema=${dbSchema}&connection_limit=5`
    const pool = new Pool({
      connectionString: dataSourceURL,
      // Patroni's internal certificate is self-signed. Match libpq sslmode=require:
      // encrypt the connection without requiring a public CA certificate.
      ssl: process.env.POSTGRES_SSLMODE === 'require' ? { rejectUnauthorized: false } : undefined,
    })
    const adapter = new PrismaPg(pool, { schema: dbSchema })
    super({
      adapter,
      errorFormat: 'pretty',
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'stdout', level: 'info' },
        { emit: 'stdout', level: 'warn' },
      ],
    })
    this.pool = pool
    PrismaService.instance = this
  }

  async onModuleInit() {
    await this.$connect()
    this.$on('query', (e: Prisma.QueryEvent) => {
      // dont print the health check queries, which contains SELECT 1 or COMMIT , BEGIN, DEALLOCATE ALL
      // this is to avoid logging health check queries which are executed by the framework.
      const excludedPatterns = ['COMMIT', 'BEGIN', 'SELECT 1', 'DEALLOCATE ALL']
      if (excludedPatterns.some((pattern) => e?.query?.toUpperCase().includes(pattern))) {
        return
      }
      // Request intake binds names, addresses and encrypted fields. Do not emit
      // parameters, SQL text, or raw database errors into application logs.
      this.logger.debug(`Database query completed in ${e.duration}ms`)
    })
  }

  async onModuleDestroy() {
    await this.$disconnect()
  }
}

export { PrismaService }
