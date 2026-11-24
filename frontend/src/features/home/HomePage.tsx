import type { FC } from 'react'
import { Button, InlineAlert } from '@bcgov/design-system-react-components'
import { Link, useNavigate } from '@tanstack/react-router'
import homepageArt from '@/assets/Homepage_Transparent.png'

const benefits = ['Simple and secure', 'Secure and simple', 'Simply secure']

const CheckMark: FC = () => (
  <svg
    aria-hidden="true"
    className="home-benefits-mark"
    fill="none"
    focusable="false"
    height="26"
    viewBox="0 0 30 26"
    width="30"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M2.00024 11.0323L9.25606 22L28.0002 2"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="4"
    />
  </svg>
)

const HomePage: FC = () => {
  const navigate = useNavigate()

  return (
    <div className="home">
      <h2 className="home-title">Update your address in British Columbia</h2>
      <div className="home-grid">
        <div className="home-intro">
          <p>Update your address in one place for multiple government services.</p>
          <ul aria-label="Benefits" className="home-benefits">
            {benefits.map((benefit) => (
              <li key={benefit}>
                <CheckMark />
                <span>{benefit}</span>
              </li>
            ))}
          </ul>
          <Button size="large" onPress={() => void navigate({ to: '/login' })}>
            Start address change
          </Button>
        </div>
        <img
          alt="A person updating their address on a laptop, with arrows pointing to vehicle, health and identity services."
          className="home-art"
          src={homepageArt}
        />
      </div>
      <InlineAlert
        description="Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae dicta sunt explicabo."
        isCloseable={false}
        title="Available for B.C residents. Supports ICBC and health..."
        variant="info"
      />
      <p className="home-learn-more">
        <Link className="app-link" to="/about">
          Learn more about this service
        </Link>
      </p>
    </div>
  )
}

export default HomePage
