import { NestFactory } from '@nestjs/core'
import { SwaggerModule } from '@nestjs/swagger'
import type { OpenAPIObject } from '@nestjs/swagger'
import { AppModule } from './app.module'
import { customLogger } from './logging/logger.config'
import type { NestExpressApplication } from '@nestjs/platform-express'
import helmet from 'helmet'
import { VersioningType } from '@nestjs/common'
import { metricsMiddleware } from './middleware/prom'
import { DEFAULT_ISSUERS, DEFAULT_SCOPE, applyOAuth2 } from './openapi.oauth2'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

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
  SwaggerModule.setup('/api/docs', app, await loadOpenApiDocument())
  return app
}

/**
 * Serves the spec prebuilt into dist/openapi.json so the spec generator stays a dev dependency.
 * Without it (local `nest start`), the generator is loaded on demand.
 */
async function loadOpenApiDocument(): Promise<OpenAPIObject> {
  const file = join(__dirname, 'openapi.json')
  let document: any
  if (existsSync(file)) {
    document = JSON.parse(readFileSync(file, 'utf8'))
  } else {
    const { buildOpenApiDocument } = await import('./openapi.config.js')
    document = buildOpenApiDocument()
  }
  // The prebuilt spec lists the Test server; Swagger UI should call the host serving it.
  delete document.servers
  applyOAuth2(
    document,
    process.env.OIDC_ISSUER || DEFAULT_ISSUERS.test,
    process.env.OIDC_SUBMISSION_SCOPE || DEFAULT_SCOPE,
  )
  return document as OpenAPIObject
}
