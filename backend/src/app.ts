import { NestFactory } from '@nestjs/core'
import { SwaggerModule } from '@nestjs/swagger'
import type { OpenAPIObject } from '@nestjs/swagger'
import { AppModule } from './app.module'
import { customLogger } from './common/logger.config'
import type { NestExpressApplication } from '@nestjs/platform-express'
import helmet from 'helmet'
import { VersioningType } from '@nestjs/common'
import { metricsMiddleware } from './middleware/prom'
import { buildOpenApiDocument } from './openapi.config'

/**
 *
 */
export async function bootstrap() {
  const app: NestExpressApplication = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: customLogger,
  })
  app.use(helmet())
  app.enableCors()
  app.set('trust proxy', 1)
  app.use(metricsMiddleware)
  app.enableShutdownHooks()
  app.setGlobalPrefix('api')
  app.enableVersioning({
    type: VersioningType.URI,
    prefix: 'v',
  })
  SwaggerModule.setup(
    '/api/docs',
    app,
    buildOpenApiDocument({
      issuer: process.env.OIDC_ISSUER,
      scope: process.env.OIDC_SUBMISSION_SCOPE,
    }) as unknown as OpenAPIObject,
  )
  return app
}
