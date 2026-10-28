/** Propagates correlation context and logs outgoing HTTP requests. */
import { requestContext } from './request-context'
import { logHttpCompletion } from './http-completion'

/**
 * Use instead of native fetch for server-side API calls. Import this function
 * directly; callers do not need to import LoggingModule or inject a service.
 *
 * Supports GET (the default), POST, PUT, PATCH, DELETE, and other HTTP methods
 * through RequestInit. Supply headers and a serialized body as with native fetch.
 * Redirects are deliberately returned to the caller rather than followed.
 *
 * During an incoming request, automatically forwards Correlation-Id and, when
 * available, X-Client-Id from the current request context. Calls outside a request
 * are still logged, but need an explicit requestContext to carry these IDs.
 *
 * Logs method, host, path, status, outcome, and duration. Never logs bodies,
 * credentials, query strings, or raw errors. Network errors are rethrown;
 * HTTP error responses are returned, so callers must check response.ok.
 *
 * @example
 * import { loggedFetch } from '../logging/logged-fetch'
 *
 * const response = await loggedFetch('https://partner-api.example/address', {
 *   method: 'PUT', // Also supports POST, PATCH, DELETE, etc.
 *   headers: {
 *     'Content-Type': 'application/json',
 *     Authorization: `Bearer ${token}`,
 *   },
 *   body: JSON.stringify(address),
 * })
 * if (!response.ok) throw new Error('Partner address update failed')
 */
export async function loggedFetch(
  input: string | URL | Request,
  init?: RequestInit,
): Promise<Response> {
  const url = new URL(input instanceof Request ? input.url : input)
  const headers = new Headers(
    init?.headers ?? (input instanceof Request ? input.headers : undefined),
  )
  const context = requestContext.getStore()
  if (context) {
    headers.set('Correlation-Id', context.correlationId)
    if (context.clientId) headers.set('X-Client-Id', context.clientId)
  }
  const method = init?.method ?? (input instanceof Request ? input.method : 'GET')
  const start = process.hrtime.bigint()
  let status: number | undefined
  try {
    const response = await fetch(input, { ...init, headers, redirect: 'manual' })
    status = response.status
    return response
  } finally {
    logHttpCompletion('http.client_request', method, url.pathname, start, status, url.hostname)
  }
}
