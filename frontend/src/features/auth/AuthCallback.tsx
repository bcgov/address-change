import { useEffect } from 'react'
import type { FC } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { getUserManager } from '@/auth/auth-service'
import LoadingPanel from '@/components/common/LoadingPanel'

// The authorization code can only be exchanged once; share the promise across StrictMode re-runs.
let callbackPromise: Promise<unknown> | undefined

const AuthCallback: FC = () => {
  const navigate = useNavigate()

  useEffect(() => {
    callbackPromise ??= getUserManager().signinRedirectCallback()
    callbackPromise
      .then(() => navigate({ to: '/address-change', replace: true }))
      .catch(() => {
        callbackPromise = undefined
        void navigate({ to: '/login', replace: true })
      })
  }, [navigate])

  return (
    <LoadingPanel
      description="Please wait while we confirm your identity."
      title="Signing you in…"
    />
  )
}

export default AuthCallback
