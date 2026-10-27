import type { MiddlewareConsumer } from '@nestjs/common'
import { Module, RequestMethod } from '@nestjs/common'
import { HTTPLoggerMiddleware } from './middleware/req.res.logger'
import { PrismaService } from './prisma.service'
import { ConfigModule } from '@nestjs/config'
import { AppService } from './app.service'
import { AppController } from './app.controller'
import { MetricsController } from './metrics.controller'
import { TerminusModule } from '@nestjs/terminus'
import { HealthController } from './health.controller'
import { AddressChangeController } from './address-change/address-change.controller'
import { AddressChangeService } from './address-change/address-change.service'
import { RequestEncryptionService } from './address-change/request-encryption.service'
import { AccessTokenGuard, AccessTokenVerifier } from './auth/access-token.guard'

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: ['.env.local', '.env'],
      ignoreEnvFile: false,
    }),
    TerminusModule,
  ],
  controllers: [AppController, MetricsController, HealthController, AddressChangeController],
  providers: [
    AppService,
    PrismaService,
    AddressChangeService,
    RequestEncryptionService,
    AccessTokenGuard,
    AccessTokenVerifier,
  ],
})
export class AppModule {
  // let's add a middleware on all routes
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
