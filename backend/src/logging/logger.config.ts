/**
 * Configures application logs as ECS JSON for SIEM ingestion.
 *
 * Application code should use NestJS Logger, rather than console.log or importing
 * customLogger. The application bootstrap registers this formatter globally.
 * Nest's log() is INFO; debug(), verbose(), warn(), and error() are also available.
 * The default LOG_LEVEL is info, so debug and verbose messages are suppressed.
 *
 * Every record receives timestamp, level, logger name, and service metadata.
 * Within an incoming request, correlation and caller metadata are added from the
 * asynchronous request context. Ordinary application logs do not require HTTP
 * or messaging event fields.
 *
 * Use descriptive messages without personal information, credentials, or tokens.
 * Error/fatal messages currently become "Application error"; when an Error is
 * supplied, only its type is retained. Raw messages and stack traces are omitted.
 *
 * @example
 * import { Injectable, Logger } from '@nestjs/common'
 *
 * @Injectable()
 * export class ReferenceDataService {
 *   private readonly logger = new Logger(ReferenceDataService.name)
 *
 *   refresh() {
 *     this.logger.log('Reference data refresh started')
 *     this.logger.debug('Checking reference data cache')
 *     this.logger.warn('Reference data is older than expected')
 *   }
 * }
 */
import { WinstonModule } from 'nest-winston'
import * as winston from 'winston'
import type { LoggerService } from '@nestjs/common'
import { correlationFields } from './request-context'

/** Flat ECS keys, with JSON arrays/numbers preserved for SIEM ingestion. */
export function toEcsLog(info: Record<string, unknown>): Record<string, unknown> {
  const payload =
    typeof info.message === 'object' && info.message !== null
      ? (info.message as Record<string, unknown>)
      : undefined
  const error =
    info.error instanceof Error
      ? info.error
      : info.message instanceof Error
        ? info.message
        : undefined
  const fields = payload ?? info
  const eventFields = Object.fromEntries(
    Object.entries(fields).filter(([key]) =>
      [
        'event.kind',
        'event.category',
        'event.type',
        'event.action',
        'event.outcome',
        'event.duration',
        'http.request.method',
        'http.response.status_code',
        'url.path',
        'server.address',
      ].includes(key),
    ),
  )
  return {
    '@timestamp': new Date().toISOString(),
    'ecs.version': '9.4.0',
    'log.level': String(info.level).toUpperCase(),
    'log.logger': info.context ?? 'Application',
    'process.thread.name': 'main',
    'service.name': process.env.SERVICE_NAME ?? 'address-change-api',
    'service.id': process.env.SERVICE_ID ?? process.env.SERVICE_NAME ?? 'address-change-api',
    'service.version': process.env.SERVICE_VERSION ?? 'unknown',
    'service.environment': process.env.SERVICE_ENVIRONMENT ?? 'LOCAL',
    ...correlationFields(),
    ...eventFields,
    ...(error || info.level === 'error' || info.level === 'fatal'
      ? { message: 'Application error', ...(error ? { 'error.type': error.name } : {}) }
      : { message: String(payload?.message ?? info.message) }),
  }
}

export const customLogger: LoggerService = WinstonModule.createLogger({
  level: process.env.LOG_LEVEL ?? 'info',
  format: winston.format.combine(winston.format.printf((info) => JSON.stringify(toEcsLog(info)))),
  transports: [new winston.transports.Console()],
  exitOnError: false,
})
