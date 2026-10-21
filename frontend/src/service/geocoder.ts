const DEFAULT_GEOCODER_URL = 'https://geocoder.api.gov.bc.ca'
const MAX_RESULTS = 8

export type AddressSuggestion = {
  label: string
  addressLineOne: string
  locality: string
  region: string
  country: string
}

type GeocoderFeature = {
  properties?: {
    fullAddress?: string
    streetAddress?: string
    localityName?: string
    provinceCode?: string
  }
}

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

export function toSuggestion(feature: GeocoderFeature): AddressSuggestion | null {
  const props = feature.properties
  const addressLineOne = text(props?.streetAddress)
  if (!props || !addressLineOne) return null
  const locality = text(props.localityName)
  const region = text(props.provinceCode) || 'BC'
  return {
    label: text(props.fullAddress) || [addressLineOne, locality, region].filter(Boolean).join(', '),
    addressLineOne,
    locality,
    region,
    country: 'Canada',
  }
}

/** Autocomplete search against the BC Address Geocoder (no API key needed for /addresses). */
export async function searchAddresses(
  query: string,
  signal?: AbortSignal,
): Promise<AddressSuggestion[]> {
  const baseUrl = import.meta.env.VITE_GEOCODER_URL ?? DEFAULT_GEOCODER_URL
  const params = new URLSearchParams({
    addressString: query,
    autoComplete: 'true',
    maxResults: String(MAX_RESULTS),
    echo: 'false',
  })
  const response = await fetch(`${baseUrl}/addresses.json?${params}`, { signal })
  if (!response.ok) {
    throw new Error(`Address search failed with status ${response.status}`)
  }
  const body = (await response.json()) as { features?: GeocoderFeature[] }
  return (body.features ?? []).flatMap((feature) => toSuggestion(feature) ?? [])
}
