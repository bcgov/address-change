import type { FC } from 'react'

type Props = { title: string; description?: string }

const LoadingPanel: FC<Props> = ({ title, description }) => (
  <div className="app-card centered-card" role="status">
    <div aria-hidden="true" className="spinner" />
    <h3>{title}</h3>
    {description && <p>{description}</p>}
  </div>
)

export default LoadingPanel
