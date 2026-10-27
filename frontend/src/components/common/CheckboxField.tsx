import { Controller, type FieldValues, type Path, type Control } from 'react-hook-form'
import { Checkbox } from '@bcgov/design-system-react-components'

type Props<T extends FieldValues> = {
  control: Control<T>
  name: Path<T>
  label: string
  isDisabled?: boolean
}

/** react-hook-form bound BC Gov design system checkbox. */
export default function CheckboxField<T extends FieldValues>({
  control,
  name,
  label,
  isDisabled,
}: Props<T>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <Checkbox
          isDisabled={isDisabled}
          isSelected={Boolean(field.value)}
          name={field.name}
          onChange={field.onChange}
        >
          {label}
        </Checkbox>
      )}
    />
  )
}
