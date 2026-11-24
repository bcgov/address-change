import { Controller, Get, VersioningType } from '@nestjs/common'
import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LoggingModule } from './logging.module'
import { customLogger } from './logger.config'
import { PassThrough } from 'node:stream'
import { transports } from 'winston'
import type { Logger as WinstonLogger } from 'winston'

@Controller({ path: 'address-change', version: '1' })
class TestController {
  @Get()
  list() {
    return []
  }
}

describe('LoggingModule routing', () => {
  let app: INestApplication
  let transport: InstanceType<typeof transports.Stream> | undefined
  const logger = (
    customLogger as typeof customLogger & { getWinstonLogger(): WinstonLogger }
  ).getWinstonLogger()
  afterEach(async () => {
    await app?.close()
    if (transport) logger.remove(transport)
    vi.restoreAllMocks()
  })

  it('logs versioned API requests with the production prefix and module wiring', async () => {
    const module = await Test.createTestingModule({
      imports: [LoggingModule],
      controllers: [TestController],
    }).compile()
    app = module.createNestApplication()
    app.useLogger(customLogger)
    app.setGlobalPrefix('api')
    app.enableVersioning({ type: VersioningType.URI, prefix: 'v' })
    await app.init()
    const output = new PassThrough()
    const lines: string[] = []
    output.on('data', (chunk) => lines.push(chunk.toString()))
    transport = new transports.Stream({ stream: output })
    logger.add(transport)
    const response = await request(app.getHttpServer())
      .get('/api/v1/address-change')
      .set('Correlation-Id', 'integration-test')
      .expect(200)
    expect(response.headers['correlation-id']).toBe('integration-test')
    expect(lines.join('')).toContain('"event.action":"http.request"')
  })
})
