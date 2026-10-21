import { Controller, type FieldValues, type Path, type Control } from 'react-hook-form'
import { Select } from '@bcgov/design-system-react-components'

export type SelectOption = { value: string; label: string }

type Props<T extends FieldValues> = {
  control: Control<T>
  name: Path<T>
  label: string
  options: SelectOption[]
  isRequired?: boolean
  description?: string
  autoComplete?: string
}

/** react-hook-form bound BC Gov design system select. Stores the option `value`. */
export default function SelectField<T extends FieldValues>({
  control,
  name,
  label,
  options,
  isRequired,
  description,
  autoComplete,
}: Props<T>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Select
          autoComplete={autoComplete}
          description={description}
          errorMessage={fieldState.error?.message}
          isInvalid={fieldState.invalid}
          isRequired={isRequired}
          items={options.map((option) => ({ id: option.value, label: option.label }))}
          label={label}
          name={field.name}
          onBlur={field.onBlur}
          onSelectionChange={(key) => field.onChange(key ? String(key) : '')}
          selectedKey={(field.value as string | undefined) || null}
        />
      )}
    />
  )
}
