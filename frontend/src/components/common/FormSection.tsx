import type { FC, ReactNode } from 'react'

type Props = {
  title: string
  description?: string
  children: ReactNode
}

/** Titled white card used to group related form content. */
const FormSection: FC<Props> = ({ title, description, children }) => (
  <fieldset className="app-card">
    <legend>{title}</legend>
    {description && <p className="app-card-description">{description}</p>}
    {children}
  </fieldset>
)

export default FormSection
