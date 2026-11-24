import { EventEmitter } from 'node:events'
import type { Request, Response } from 'express'
import { describe, it, expect, vi } from 'vitest'
import { Logger } from '@nestjs/common'
import { HTTPLoggerMiddleware } from './http-logging.middleware'
import { requestContext } from './request-context'

describe('incoming HTTP completion', () => {
  it('returns correlation, logs once on finish/close and excludes personal data', () => {
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {})
    const request = {
      method: 'POST',
      originalUrl: '/api/v1/address-change?secret=private',
      get: (name: string) => (name === 'Correlation-Id' ? 'test-id' : undefined),
    } as Request
    const response = Object.assign(new EventEmitter(), {
      setHeader: vi.fn(),
      statusCode: 401,
      writableFinished: true,
    })
    new HTTPLoggerMiddleware().use(request, response as unknown as Response, () => {
      expect(requestContext.getStore()?.correlationId).toBe('test-id')
    })
    expect(requestContext.getStore()).toBeUndefined()
    response.emit('finish')
    response.emit('close')
    expect(response.setHeader).toHaveBeenCalledWith('Correlation-Id', 'test-id')
    expect(log).toHaveBeenCalledTimes(1)
    expect(log.mock.calls[0]?.[0]).toMatchObject({
      'event.outcome': 'failure',
      'http.response.status_code': 401,
      'url.path': '/api/v1/address-change',
    })
    expect(JSON.stringify(log.mock.calls)).not.toContain('private')
    log.mockRestore()
  })
})
