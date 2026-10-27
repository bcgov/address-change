import { useEffect, useState } from 'react'
import type { FC } from 'react'
import { Button } from '@bcgov/design-system-react-components'
import { useNavigate } from '@tanstack/react-router'
import { getUserManager } from '@/auth/auth-service'
import { useAuth } from '@/auth/auth-context'
import LoadingPanel from '@/components/common/LoadingPanel'

// The authorization code can only be exchanged once; share the promise across StrictMode re-runs.
let callbackPromise: Promise<unknown> | undefined

const CANCELLED_ERRORS = ['interaction_required', 'access_denied', 'login_required']

const AuthCallback: FC = () => {
  const navigate = useNavigate()
  const { signIn } = useAuth()
  const [error, setError] = useState<string | undefined>()

  useEffect(() => {
    callbackPromise ??= getUserManager().signinRedirectCallback()
    callbackPromise
      .then(() => navigate({ to: '/address-change', replace: true }))
      .catch((e: unknown) => {
        const code = (e as { error?: string } | null)?.error
        setError(code ?? 'unknown')
      })
  }, [navigate])

  if (!error) {
    return (
      <LoadingPanel
        description="Please wait while we confirm your identity."
        title="Signing you in…"
      />
    )
  }

  const cancelled = CANCELLED_ERRORS.includes(error)
  return (
    <section aria-labelledby="callback-heading" className="app-card centered-card" role="alert">
      <h2 id="callback-heading">
        {cancelled ? 'Sign in was cancelled' : 'We couldn’t sign you in'}
      </h2>
      <p>
        {cancelled
          ? 'You cancelled the sign in or it couldn’t be completed. No changes were made. You can try again when you’re ready.'
          : 'Something went wrong while signing you in. Please try again.'}
      </p>
      <Button
        onPress={() => {
          callbackPromise = undefined
          void signIn()
        }}
        size="large"
      >
        Try again
      </Button>
    </section>
  )
}

export default AuthCallback
