import { createContext, use } from 'react'
import type { UserSummary } from './claims'

export type AuthContextValue = {
  isLoading: boolean
  isAuthenticated: boolean
  user: UserSummary | null
  signIn: () => Promise<void>
  signOut: () => Promise<void>
  getAccessToken: () => Promise<string | null>
}

const unauthenticated: AuthContextValue = {
  isLoading: false,
  isAuthenticated: false,
  user: null,
  signIn: async () => undefined,
  signOut: async () => undefined,
  getAccessToken: async () => null,
}

export const AuthContext = createContext<AuthContextValue>(unauthenticated)

export const useAuth = (): AuthContextValue => use(AuthContext)
