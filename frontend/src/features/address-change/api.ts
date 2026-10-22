import apiService from '@/service/api-service'
import type { toAddressChangeRequest } from './schema'

export type AddressChangeRequestBody = ReturnType<typeof toAddressChangeRequest>
export type AddressChangeAcknowledgement = { requestId: string }
export type AddressChangeOperation = {
  partnerCode: string
  deliveryMode: string
  status: string
}
export type AddressChangeSummary = {
  requestId: string
  status: string
  effectiveDate: string | null
  createdAt: string
  submittedAt: string | null
  updatedAt: string
  operations: AddressChangeOperation[]
}
export type DraftData = { step: number; values: Record<string, unknown> }
export type AddressChangeDraftResponse = {
  requestId: string
  idempotencyKey: string
  status: 'DRAFT'
  draft: DraftData
}

const client = () => apiService.getAxiosInstance()

export async function listAddressChangeRequests(): Promise<AddressChangeSummary[]> {
  const response = await client().get<AddressChangeSummary[]>('/v1/address-change')
  return response.data
}

export async function saveAddressChangeDraft(
  idempotencyKey: string,
  draft: DraftData,
): Promise<AddressChangeAcknowledgement> {
  const response = await client().put<AddressChangeAcknowledgement>('/v1/address-change/drafts', {
    idempotencyKey,
    draft,
  })
  return response.data
}

export async function getAddressChangeDraft(
  requestId: string,
): Promise<AddressChangeDraftResponse> {
  const response = await client().get<AddressChangeDraftResponse>(
    `/v1/address-change/drafts/${encodeURIComponent(requestId)}`,
  )
  return response.data
}

export async function submitAddressChange(
  body: AddressChangeRequestBody,
): Promise<AddressChangeAcknowledgement> {
  const response = await client().post<AddressChangeAcknowledgement>('/v1/address-change', body)
  return response.data
}
