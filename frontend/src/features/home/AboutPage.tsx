import type { FC } from 'react'
import { Link } from '@tanstack/react-router'

const AboutPage: FC = () => (
  <section aria-labelledby="about-heading" className="home">
    <h2 className="home-title" id="about-heading">
      About Address Change BC
    </h2>
    <p>
      Address Change BC lets B.C. residents update their address in one place for multiple
      government services, including ICBC and health services.
    </p>
    <p>
      <Link className="app-link" to="/">
        Back to home
      </Link>
    </p>
  </section>
)

export default AboutPage
