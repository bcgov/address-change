import type { FC } from 'react'

type Props = {
  steps: string[]
  current: number
  /** Called when a completed step is chosen; completed steps are plain text without it. */
  onSelect?: (step: number) => void
  isDisabled?: boolean
}

/** Ordered list showing progress through the request steps. */
const StepIndicator: FC<Props> = ({ steps, current, onSelect, isDisabled }) => (
  <nav aria-label="Progress">
    <p className="step-indicator-summary">
      Step {current + 1} of {steps.length}
    </p>
    <ol className="step-indicator">
      {steps.map((label, index) => {
        const isComplete = index < current
        const content = (
          <>
            <span aria-hidden="true" className="step-indicator-marker">
              {isComplete ? '\u2713' : index + 1}
            </span>
            <span className="step-indicator-label">{label}</span>
          </>
        )
        return (
          <li
            aria-current={index === current ? 'step' : undefined}
            className={index === current ? 'is-current' : isComplete ? 'is-complete' : undefined}
            key={label}
          >
            {isComplete && onSelect ? (
              <button
                className="step-indicator-link"
                disabled={isDisabled}
                onClick={() => onSelect(index)}
                type="button"
              >
                {content}
              </button>
            ) : (
              content
            )}
          </li>
        )
      })}
    </ol>
  </nav>
)

export default StepIndicator
