import { useState } from 'react'
import { Controller, type FieldValues, type Path, type Control } from 'react-hook-form'
import { TextField } from '@bcgov/design-system-react-components'

type Props<T extends FieldValues> = {
  control: Control<T>
  name: Path<T>
  label: string
  type?: 'text' | 'email' | 'tel' | 'date'
  isRequired?: boolean
  description?: string
  autoComplete?: string
  /** Transforms the typed text before it is stored (e.g. input masking). */
  format?: (value: string) => string
  /** Short unit text shown inside the input on the right, e.g. `cm`. */
  suffix?: string
  /** Masks the value and adds a show/hide toggle. */
  isSecret?: boolean
}

/** react-hook-form bound BC Gov design system text input. */
export default function FormField<T extends FieldValues>({
  control,
  name,
  label,
  type = 'text',
  isRequired,
  description,
  autoComplete,
  format,
  suffix,
  isSecret,
}: Props<T>) {
  const [isRevealed, setIsRevealed] = useState(false)
  const toggle = (
    <button
      aria-label={`${isRevealed ? 'Hide' : 'Show'} ${label.toLowerCase()}`}
      className="field-toggle"
      onClick={() => setIsRevealed((value) => !value)}
      type="button"
    >
      {isRevealed ? 'Hide' : 'Show'}
    </button>
  )
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <TextField
          autoComplete={autoComplete}
          description={description}
          errorMessage={fieldState.error?.message}
          iconRight={
            isSecret ? (
              toggle
            ) : suffix ? (
              <span aria-hidden="true" className="field-suffix">
                {suffix}
              </span>
            ) : undefined
          }
          isInvalid={fieldState.invalid}
          isRequired={isRequired}
          label={label}
          name={field.name}
          onBlur={field.onBlur}
          onChange={(value) => field.onChange(format ? format(value) : value)}
          type={isSecret && !isRevealed ? 'password' : type}
          value={(field.value as string | undefined) ?? ''}
        />
      )}
    />
  )
}
