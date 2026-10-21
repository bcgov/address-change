import type { User } from 'oidc-client-ts'

export type TokenAddress = {
  addressLineOne: string
  addressLineTwo: string
  locality: string
  region: string
  postalCode: string
  country: string
}

export type UserSummary = {
  sub: string
  displayName: string
  firstName: string
  lastName: string
  email: string
  /** ISO date (YYYY-MM-DD) from the `birthdate` claim, or empty when the IdP doesn't supply it. */
  birthdate: string
  currentAddress: TokenAddress | null
}

type Claims = Record<string, unknown>

const str = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

function readAddress(claims: Claims): TokenAddress | null {
  // Standard OIDC `address` claim may be an object; some providers send it flat.
  const nested = typeof claims.address === 'object' && claims.address !== null ? claims.address : {}
  const source = nested as Claims
  const street = str(source.street_address) || str(claims.street_address)
  const [addressLineOne = '', ...rest] = street.split(/\r?\n/)
  const address: TokenAddress = {
    addressLineOne,
    addressLineTwo: rest.join(', '),
    locality: str(source.locality) || str(claims.locality),
    region: str(source.region) || str(claims.region),
    postalCode: str(source.postal_code) || str(claims.postal_code),
    country: str(source.country) || str(claims.country),
  }
  return Object.values(address).some(Boolean) ? address : null
}

export function getUserSummary(user: Pick<User, 'profile'>): UserSummary {
  const claims = user.profile as Claims
  const firstName = str(claims.given_name) || str(claims.given_names).split(/\s+/)[0]
  const lastName = str(claims.family_name)
  return {
    sub: str(claims.sub),
    displayName: str(claims.display_name) || str(claims.name) || `${firstName} ${lastName}`.trim(),
    firstName,
    lastName,
    email: str(claims.email),
    birthdate: /^\d{4}-\d{2}-\d{2}$/.test(str(claims.birthdate)) ? str(claims.birthdate) : '',
    currentAddress: readAddress(claims),
  }
}
