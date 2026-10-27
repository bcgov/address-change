import { useCallback, useState } from 'react'
import { saveAddressChangeDraft } from './api'
import type { AddressChangeFormValues } from './schema'

export type RequestDraft = {
  /** Stable per-request key; the draft is stored under it and it is reused for final submission. */
  idempotencyKey: string
  /** Saves the form and current step to the server and returns the draft's request ID. Rejects if the save fails. */
  save: (step: number, values: AddressChangeFormValues) => Promise<string>
}

/** Server-backed draft lifecycle: each save upserts the draft identified by the idempotency key. */
export function useRequestDraft(existingKey?: string): RequestDraft {
  const [idempotencyKey] = useState(() => existingKey ?? crypto.randomUUID())
  const save = useCallback(
    async (step: number, values: AddressChangeFormValues) => {
      const ack = await saveAddressChangeDraft(idempotencyKey, { step, values })
      return ack.requestId
    },
    [idempotencyKey],
  )
  return { idempotencyKey, save }
}
