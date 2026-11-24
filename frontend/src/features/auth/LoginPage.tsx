import { useState } from 'react'
import type { FC } from 'react'
import { Button, Link, Separator } from '@bcgov/design-system-react-components'
import { useAuth } from '@/auth/auth-context'
import LoadingPanel from '@/components/common/LoadingPanel'
import securityCheck from '@/assets/security-check.png'

const description =
  'accusantium doloremque laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae dicta sunt explicabo.'

const otherWays = [
  {
    title: 'Get help at Service BC',
    linkText: 'Find a Service BC location',
    href: 'https://www2.gov.bc.ca/gov/content/governments/organizational-structure/ministries-organizations/ministries/citizens-services/servicebc',
    icon: (
      <svg
        aria-hidden="true"
        fill="currentColor"
        focusable="false"
        height="40"
        viewBox="0 0 24 24"
        width="40"
      >
        <path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z" />
      </svg>
    ),
  },
  {
    title: 'Update directly with ICBC',
    linkText: 'Go to ICBC',
    href: 'https://www.icbc.com',
    icon: (
      <svg
        aria-hidden="true"
        fill="currentColor"
        focusable="false"
        height="40"
        viewBox="0 0 24 24"
        width="40"
      >
        <path d="M5 11l1.5-4.5A2 2 0 0 1 8.4 5h7.2a2 2 0 0 1 1.9 1.5L19 11h1v7h-2v2h-2v-2H8v2H6v-2H4v-7h1Zm2.2 0h9.6l-1-3H8.2l-1 3ZM7 14.5a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5Zm10 0a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5Z" />
      </svg>
    ),
  },
  {
    title: 'Update directly with health services',
    linkText: 'Go to...',
    href: 'https://www2.gov.bc.ca/gov/content/health',
    icon: (
      <svg
        aria-hidden="true"
        fill="currentColor"
        focusable="false"
        height="40"
        viewBox="0 0 24 24"
        width="40"
      >
        <path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6V3Z" />
      </svg>
    ),
  },
]

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
    <div className="login">
      <section aria-labelledby="login-heading" className="login-grid">
        <div className="login-info">
          <h2 id="login-heading">Sign in with your B.C Service Card</h2>
          <p>
            Address Change BC lets you update your address for multiple government services in one
            place. To use this service, you need to sign in with your B.C Service Card.
          </p>
          <div className="login-action">
            <Button onPress={startSignIn} size="large">
              Sign in with B.C. Service Card
            </Button>
            <p className="login-note">
              You&apos;ll be taken to BC Services Card to verify your identity.
            </p>
          </div>
        </div>
        <img alt="" className="login-art" src={securityCheck} />
      </section>
      <Separator />
      <section aria-labelledby="other-ways-heading" className="other-ways">
        <h2 id="other-ways-heading">Other ways to update your address</h2>
        <p>You can update your address directly with ICBC or the health service</p>
        <ul className="other-ways-list">
          {otherWays.map(({ title, linkText, href, icon }) => (
            <li className="other-way-card" key={title}>
              <span aria-hidden="true" className="other-way-icon">
                {icon}
              </span>
              <div className="other-way-text">
                <h3>{title}</h3>
                <p>{description}</p>
                <Link href={href} rel="noopener noreferrer" target="_blank">
                  {linkText}
                </Link>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

export default LoginPage
