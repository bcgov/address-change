import type { FC } from 'react'
import { Button } from '@bcgov/design-system-react-components'
import { useAuth } from '@/auth/auth-context'
import securityCheck from '@/assets/security-check.png'

const LoginPage: FC = () => {
  const { signIn } = useAuth()
  return (
    <section aria-labelledby="login-heading" className="login-panel">
      <div className="login-panel-content">
        <h2 id="login-heading">Sign in to change your address</h2>
        <p>Securely tell BC government services about your new address in one place.</p>
        <Button onPress={() => void signIn()} size="large">
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
