import type { FC, ReactNode } from 'react'

type Props = {
  title: string
  description?: string
  actions?: ReactNode
}

const PageHeading: FC<Props> = ({ title, description, actions }) => (
  <div className="page-heading">
    <div>
      <h2>{title}</h2>
      {description && <p>{description}</p>}
    </div>
    {actions}
  </div>
)

export default PageHeading
