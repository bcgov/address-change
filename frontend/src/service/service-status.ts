import { useSyncExternalStore } from 'react'

let unavailable = false
const listeners = new Set<() => void>()

export function markServiceUnavailable(): void {
  if (unavailable) return
  unavailable = true
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useServiceUnavailable(): boolean {
  return useSyncExternalStore(subscribe, () => unavailable)
}

// Gateway errors or no response at all mean the backend can't be reached.
export function isServiceUnavailableError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const { response, request } = error as {
    response?: { status?: number }
    request?: unknown
  }
  if (response) return [502, 503, 504].includes(response.status ?? 0)
  return request !== undefined
}
