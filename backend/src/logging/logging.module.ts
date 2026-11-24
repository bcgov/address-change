/** Registers HTTP logging middleware with the NestJS application. */
import { Module, RequestMethod } from '@nestjs/common'
import type { NestModule, MiddlewareConsumer } from '@nestjs/common'
import { HTTPLoggerMiddleware } from './http-logging.middleware'

@Module({})
export class LoggingModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(HTTPLoggerMiddleware)
      .exclude(
        { path: 'metrics', method: RequestMethod.ALL },
        { path: 'health', method: RequestMethod.ALL },
      )
      .forRoutes('*')
  }
}
