import type { FC, ReactNode } from 'react'

type Props = {
  title: string
  description?: string
  /** Keeps the title for assistive tech when the step heading already shows it. */
  hideTitle?: boolean
  children: ReactNode
}

/** Titled white card used to group related form content. */
const FormSection: FC<Props> = ({ title, description, hideTitle, children }) => (
  <fieldset className="app-card">
    <legend className={hideTitle ? 'visually-hidden' : undefined}>{title}</legend>
    {description && <p className="app-card-description">{description}</p>}
    {children}
  </fieldset>
)

export default FormSection
