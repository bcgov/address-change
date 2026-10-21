import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FC, ReactNode } from 'react'
import type { User } from 'oidc-client-ts'
import { getUserManager, getValidUser } from './auth-service'
import { getUserSummary } from './claims'
import { AuthContext, type AuthContextValue } from './auth-context'

export const AuthProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [oidcUser, setOidcUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const manager = getUserManager()
    const onLoaded = (user: User) => setOidcUser(user)
    const onUnloaded = () => setOidcUser(null)
    manager.events.addUserLoaded(onLoaded)
    manager.events.addUserUnloaded(onUnloaded)
    manager.events.addSilentRenewError(onUnloaded)
    manager.events.addAccessTokenExpired(onUnloaded)

    void getValidUser()
      .then(setOidcUser)
      .finally(() => setIsLoading(false))

    return () => {
      manager.events.removeUserLoaded(onLoaded)
      manager.events.removeUserUnloaded(onUnloaded)
      manager.events.removeSilentRenewError(onUnloaded)
      manager.events.removeAccessTokenExpired(onUnloaded)
    }
  }, [])

  const signIn = useCallback(() => getUserManager().signinRedirect(), [])
  const signOut = useCallback(() => getUserManager().signoutRedirect(), [])
  const getAccessToken = useCallback(async () => (await getValidUser())?.access_token ?? null, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      isLoading,
      isAuthenticated: oidcUser !== null,
      user: oidcUser ? getUserSummary(oidcUser) : null,
      signIn,
      signOut,
      getAccessToken,
    }),
    [isLoading, oidcUser, signIn, signOut, getAccessToken],
  )

  return <AuthContext value={value}>{children}</AuthContext>
}
