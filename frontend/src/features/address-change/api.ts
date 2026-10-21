import apiService from '@/service/api-service'
import type { toAddressChangeRequest } from './schema'

export type AddressChangeRequestBody = ReturnType<typeof toAddressChangeRequest>
export type AddressChangeAcknowledgement = { requestId: string }

export async function submitAddressChange(
  body: AddressChangeRequestBody,
): Promise<AddressChangeAcknowledgement> {
  const response = await apiService
    .getAxiosInstance()
    .post<AddressChangeAcknowledgement>('/v1/address-change', body)
  return response.data
}
