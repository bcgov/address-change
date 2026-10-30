import { renderHook } from '@testing-library/react'
import { useAuth } from '@/auth/auth-context'

describe('useAuth defaults', () => {
  test('is unauthenticated without a provider', async () => {
    const { result } = renderHook(() => useAuth())
    expect(result.current.isAuthenticated).toBe(false)
    expect(result.current.isLoading).toBe(false)
    expect(result.current.user).toBeNull()
    await expect(result.current.getAccessToken()).resolves.toBeNull()
    await expect(result.current.signIn()).resolves.toBeUndefined()
    await expect(result.current.signOut()).resolves.toBeUndefined()
  })
})
