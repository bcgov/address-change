/** Establishes incoming request context and logs response completion. */
import { randomUUID } from 'node:crypto'
import type { Request, Response, NextFunction } from 'express'
import type { NestMiddleware } from '@nestjs/common'
import { Injectable } from '@nestjs/common'
import { logHttpCompletion } from './http-completion'
import { requestContext, safeIdentifier } from './request-context'

@Injectable()
export class HTTPLoggerMiddleware implements NestMiddleware {
  use(request: Request, response: Response, next: NextFunction): void {
    const context = {
      correlationId: safeIdentifier(request.get('Correlation-Id')) ?? randomUUID(),
      clientId: safeIdentifier(request.get('X-Client-Id')),
      serviceId: safeIdentifier(request.get('X-Service-Id')),
    }
    const start = process.hrtime.bigint()
    response.setHeader('Correlation-Id', context.correlationId)
    let logged = false
    const complete = (aborted: boolean) => {
      if (logged) return
      logged = true
      requestContext.run(context, () => {
        logHttpCompletion(
          'http.request',
          request.method,
          request.originalUrl.split('?')[0] ?? '/',
          start,
          aborted ? undefined : response.statusCode,
        )
      })
    }
    response.once('finish', () => complete(false))
    response.once('close', () => complete(!response.writableFinished))
    requestContext.run(context, next)
  }
}
