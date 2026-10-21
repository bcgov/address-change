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
}: Props<T>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <TextField
          autoComplete={autoComplete}
          description={description}
          errorMessage={fieldState.error?.message}
          isInvalid={fieldState.invalid}
          isRequired={isRequired}
          label={label}
          name={field.name}
          onBlur={field.onBlur}
          onChange={(value) => field.onChange(format ? format(value) : value)}
          type={type}
          value={(field.value as string | undefined) ?? ''}
        />
      )}
    />
  )
}
