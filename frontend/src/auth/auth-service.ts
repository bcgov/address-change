import { UserManager, WebStorageStateStore, type User } from 'oidc-client-ts'

const DEFAULT_AUTHORITY = 'https://dev.loginproxy.gov.bc.ca/auth/realms/standard'
const DEFAULT_CLIENT_ID = 'address-change-bc-6667'

export const AUTH_CALLBACK_PATH = '/auth/callback'

type RuntimeConfig = { oidcAuthority?: string; oidcClientId?: string; oidcScope?: string }

let runtimeConfig: RuntimeConfig = {}

/** Loads per-environment OIDC settings served at /config.json; falls back to build-time values. */
export async function loadRuntimeConfig(): Promise<void> {
  try {
    const response = await fetch('/config.json', { cache: 'no-store' })
    if (response.ok && response.headers.get('content-type')?.includes('application/json')) {
      runtimeConfig = (await response.json()) as RuntimeConfig
    }
  } catch {
    runtimeConfig = {}
  }
}

export function createUserManager(): UserManager {
  const origin = window.location.origin
  return new UserManager({
    authority:
      runtimeConfig.oidcAuthority || import.meta.env.VITE_OIDC_AUTHORITY || DEFAULT_AUTHORITY,
    client_id:
      runtimeConfig.oidcClientId || import.meta.env.VITE_OIDC_CLIENT_ID || DEFAULT_CLIENT_ID,
    redirect_uri: `${origin}${AUTH_CALLBACK_PATH}`,
    post_logout_redirect_uri: `${origin}/login`,
    response_type: 'code', // authorization code flow; oidc-client-ts always adds PKCE (S256)
    scope: runtimeConfig.oidcScope || import.meta.env.VITE_OIDC_SCOPE || 'openid profile email',
    automaticSilentRenew: true, // refreshes the token via the refresh_token grant before expiry
    userStore: new WebStorageStateStore({ store: window.sessionStorage }),
  })
}

let manager: UserManager | undefined

export function getUserManager(): UserManager {
  manager ??= createUserManager()
  return manager
}

/** Returns the signed-in user, or null when there is no valid session. */
export async function getValidUser(): Promise<User | null> {
  const user = await getUserManager().getUser()
  return user && !user.expired ? user : null
}
