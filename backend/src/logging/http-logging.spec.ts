import { describe, it, expect, vi, afterEach } from 'vitest'
import { Logger } from '@nestjs/common'
import { loggedFetch } from './logged-fetch'
import { requestContext, safeIdentifier } from './request-context'
import { toEcsLog } from './logger.config'

afterEach(() => vi.restoreAllMocks())

describe('ECS HTTP logging', () => {
  it('keeps concurrent request contexts separate and preserves ECS types', async () => {
    const rows = await Promise.all(
      ['first', 'second'].map((correlationId) =>
        requestContext.run({ correlationId }, async () => {
          await Promise.resolve()
          return toEcsLog({
            level: 'info',
            message: 'done',
            'event.duration': 12,
            'event.category': ['web', 'api'],
          })
        }),
      ),
    )
    expect(rows.map((row) => row['http.request.id'])).toEqual(['first', 'second'])
    expect(rows[0]?.['event.duration']).toBe(12)
    expect(rows[0]?.['event.category']).toEqual(['web', 'api'])
    expect(requestContext.getStore()).toBeUndefined()
  })

  it('rejects unsafe header values and excludes raw errors', () => {
    expect(safeIdentifier('bad\nheader')).toBeUndefined()
    expect(safeIdentifier('x'.repeat(129))).toBeUndefined()
    expect(safeIdentifier('valid-id')).toBe('valid-id')
    const row = toEcsLog({ level: 'error', message: new Error('secret-token'), stack: 'private' })
    expect(row['error.type']).toBe('Error')
    expect(JSON.stringify(row)).not.toMatch(/secret-token|private/)
    expect(
      JSON.stringify(
        toEcsLog({ level: 'error', message: 'secret-token', error: new Error('private') }),
      ),
    ).not.toMatch(/secret-token|private/)
  })

  it('propagates correlation and client IDs and omits query/body/header secrets', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 200 }))
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {})
    await requestContext.run({ correlationId: 'test-id', clientId: 'caller' }, () =>
      loggedFetch('https://example.test/path?token=secret', {
        headers: { Authorization: 'Bearer private' },
      }),
    )
    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Headers
    expect(headers.get('Correlation-Id')).toBe('test-id')
    expect(headers.get('X-Client-Id')).toBe('caller')
    expect(log.mock.calls[0]?.[0]).toMatchObject({
      'event.action': 'http.client_request',
      'url.path': '/path',
      'http.response.status_code': 200,
    })
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/secret|private/)
  })

  it.each([
    ['default', 'https://example.test/path', undefined, 'manual'],
    ['explicit follow', 'https://example.test/path', { redirect: 'follow' }, 'follow'],
    ['explicit error', 'https://example.test/path', { redirect: 'error' }, 'error'],
    [
      'Request policy',
      new Request('https://example.test/path', { redirect: 'error' }),
      undefined,
      'error',
    ],
    [
      'init overrides Request',
      new Request('https://example.test/path', { redirect: 'error' }),
      { redirect: 'follow' },
      'follow',
    ],
  ] as const)('preserves redirect behavior: %s', async (_name, input, init, expected) => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'))
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {})
    await loggedFetch(input, init)
    expect(fetchMock.mock.calls[0]?.[1]?.redirect).toBe(expected)
  })

  it('logs failed outgoing calls without leaking the exception', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('private'))
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {})
    await expect(loggedFetch('https://example.test/path')).rejects.toThrow('private')
    expect(log.mock.calls[0]?.[0]).toMatchObject({ 'event.outcome': 'failure' })
    expect(JSON.stringify(log.mock.calls)).not.toContain('private')
  })
})
