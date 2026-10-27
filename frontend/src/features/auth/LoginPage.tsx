import { useState } from 'react'
import type { FC } from 'react'
import { Button } from '@bcgov/design-system-react-components'
import { useAuth } from '@/auth/auth-context'
import LoadingPanel from '@/components/common/LoadingPanel'
import securityCheck from '@/assets/security-check.png'

const LoginPage: FC = () => {
  const { signIn } = useAuth()
  const [isRedirecting, setIsRedirecting] = useState(false)

  const startSignIn = () => {
    setIsRedirecting(true)
    signIn().catch(() => setIsRedirecting(false))
  }

  if (isRedirecting) {
    return (
      <LoadingPanel
        description="You'll be taken to BC Services Card to verify your identity."
        title="Signing you in…"
      />
    )
  }

  return (
    <section aria-labelledby="login-heading" className="login-panel">
      <div className="login-panel-content">
        <h2 id="login-heading">Sign in to change your address</h2>
        <p>Securely tell BC government services about your new address in one place.</p>
        <h3 className="login-panel-subheading">Is this service for you?</h3>
        <ul className="login-panel-requirements">
          <li>You are moving to a new address within British Columbia.</li>
          <li>You have moved to a new address within British Columbia.</li>
        </ul>
        <Button onPress={startSignIn} size="large">
          Sign in with BC Services Card
        </Button>
        <p className="login-panel-note">
          You&apos;ll be taken to BC Services Card to verify your identity.
        </p>
      </div>
      <img alt="" className="login-panel-art" src={securityCheck} width={260} />
    </section>
  )
}

export default LoginPage
