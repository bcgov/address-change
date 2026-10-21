import { UserManager, WebStorageStateStore, type User } from 'oidc-client-ts'

const DEFAULT_AUTHORITY = 'https://dev.loginproxy.gov.bc.ca/auth/realms/standard'
const DEFAULT_CLIENT_ID = 'address-change-bc-6667'

export const AUTH_CALLBACK_PATH = '/auth/callback'

export function createUserManager(): UserManager {
  const origin = window.location.origin
  return new UserManager({
    authority: import.meta.env.VITE_OIDC_AUTHORITY ?? DEFAULT_AUTHORITY,
    client_id: import.meta.env.VITE_OIDC_CLIENT_ID ?? DEFAULT_CLIENT_ID,
    redirect_uri: `${origin}${AUTH_CALLBACK_PATH}`,
    post_logout_redirect_uri: `${origin}/login`,
    response_type: 'code', // authorization code flow; oidc-client-ts always adds PKCE (S256)
    scope: 'openid profile email',
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
