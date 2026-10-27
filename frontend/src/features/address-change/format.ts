type AddressLike = {
  addressLineOne?: string
  addressLineTwo?: string
  locality?: string
  region?: string
  postalCode?: string
  country?: string
}

export const formatAddress = (address: AddressLike | null | undefined): string =>
  address
    ? [
        address.addressLineOne,
        address.addressLineTwo,
        address.locality,
        address.region,
        address.postalCode,
        address.country,
      ]
        .filter(Boolean)
        .join(', ')
    : ''

export const PARTNER_NAMES: Record<string, string> = {
  BCSC: 'BC Services Card (BCSC)',
  ICBC: 'BC Drivers License (ICBC)',
  HEALTH: 'Medical Services Plan (MSP)',
}

export const formatDate = (value: string | null | undefined): string => {
  if (!value) return ''
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value)
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' })
}
