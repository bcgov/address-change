/** Maintains correlation and caller metadata throughout each asynchronous request. */
import { AsyncLocalStorage } from 'node:async_hooks'

export type RequestContext = { correlationId: string; clientId?: string; serviceId?: string }
export const requestContext = new AsyncLocalStorage<RequestContext>()
export const safeIdentifier = (value: unknown): string | undefined =>
  typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(value)
    ? value
    : undefined

export function correlationFields() {
  const context = requestContext.getStore()
  return context
    ? {
        'http.request.id': context.correlationId,
        ...(context.clientId ? { 'client.id': context.clientId } : {}),
        labels: {
          loc_correlation_id: context.correlationId,
          ...(context.serviceId ? { sdx_service_id: context.serviceId } : {}),
        },
      }
    : {}
}
