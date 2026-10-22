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
  effectiveDate: string
  createdAt: string
  operations: AddressChangeOperation[]
}

export async function listAddressChangeRequests(): Promise<AddressChangeSummary[]> {
  const response = await apiService
    .getAxiosInstance()
    .get<AddressChangeSummary[]>('/v1/address-change')
  return response.data
}

export async function submitAddressChange(
  body: AddressChangeRequestBody,
): Promise<AddressChangeAcknowledgement> {
  const response = await apiService
    .getAxiosInstance()
    .post<AddressChangeAcknowledgement>('/v1/address-change', body)
  return response.data
}
