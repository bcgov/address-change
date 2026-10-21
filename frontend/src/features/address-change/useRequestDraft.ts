import { useCallback, useState } from 'react'
import type { AddressChangeFormValues } from './schema'

export type RequestDraft = {
  /** Stable per-form key; doubles as the idempotency key for submission. */
  idempotencyKey: string
  /** Called when form values change. No-op until the database-backed draft API exists. */
  scheduleSave: (values: Partial<AddressChangeFormValues>) => void
}

/**
 * Seam for the future draft lifecycle (create draft on start, debounced incremental
 * autosave, submit). Today it only provides the idempotency key.
 */
export function useRequestDraft(): RequestDraft {
  const [idempotencyKey] = useState(() => crypto.randomUUID())
  const scheduleSave = useCallback((_values: Partial<AddressChangeFormValues>) => undefined, [])
  return { idempotencyKey, scheduleSave }
}
