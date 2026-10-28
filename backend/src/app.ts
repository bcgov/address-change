import { NestFactory } from '@nestjs/core'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { AppModule } from './app.module'
import { customLogger } from './logging/logger.config'
import type { NestExpressApplication } from '@nestjs/platform-express'
import helmet from 'helmet'
import { VersioningType } from '@nestjs/common'
import { metricsMiddleware } from './middleware/prom'

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
  const config = new DocumentBuilder()
    .setTitle('Address Change API')
    .setDescription('Address change application API')
    .setVersion('1.0')
    .build()

  const document = SwaggerModule.createDocument(app, config)
  SwaggerModule.setup('/api/docs', app, document)
  return app
}
