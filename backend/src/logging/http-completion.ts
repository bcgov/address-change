/** Builds standard ECS completion events for incoming and outgoing HTTP requests. */
import { Logger } from '@nestjs/common'

export function logHttpCompletion(
  action: 'http.request' | 'http.client_request',
  method: string,
  path: string,
  start: bigint,
  status?: number,
  server?: string,
) {
  new Logger('HTTP').log({
    message:
      action === 'http.request' ? 'HTTP request completed' : 'Outbound HTTP request completed',
    'event.kind': 'event',
    'event.category': ['web', 'api'],
    'event.type': ['access'],
    'event.action': action,
    'event.outcome': status !== undefined && status < 400 ? 'success' : 'failure',
    'event.duration': Number(process.hrtime.bigint() - start),
    'http.request.method': method,
    ...(status !== undefined ? { 'http.response.status_code': status } : {}),
    'url.path': path,
    ...(server ? { 'server.address': server } : {}),
  })
}
