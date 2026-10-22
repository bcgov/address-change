import type { Control, FieldValues, Path } from 'react-hook-form'
import AddressSearch from './AddressSearch'
import FormField from './FormField'
import FormSection from './FormSection'
import SelectField from './SelectField'
import { CANADIAN_PROVINCES } from '@/utils/provinces'
import { formatPostalCode } from '@/utils/postal-code'
import type { AddressSuggestion } from '@/service/geocoder'

type Props<T extends FieldValues> = {
  control: Control<T>
  /** Form path of the address object, e.g. `residentialAddress`. */
  prefix: string
  legend: string
  description?: string
  /** When provided, shows a BC address search that reports the chosen suggestion. */
  onAddressSelected?: (suggestion: AddressSuggestion) => void
  /** Fixes the province to British Columbia and shows it as text instead of an input. */
  lockToBritishColumbia?: boolean
}

/** Reusable set of address inputs bound to `${prefix}.{field}`. */
export default function AddressFields<T extends FieldValues>({
  control,
  prefix,
  legend,
  description,
  onAddressSelected,
  lockToBritishColumbia,
}: Props<T>) {
  const path = (field: string) => `${prefix}.${field}` as Path<T>
  return (
    <FormSection description={description} title={legend}>
      {onAddressSelected && <AddressSearch onSelect={onAddressSelected} />}
      <div className="field-grid field-grid--two">
        <FormField
          autoComplete="address-line1"
          control={control}
          isRequired
          label="Address line 1"
          name={path('addressLineOne')}
        />
        <FormField
          autoComplete="address-line2"
          control={control}
          label="Address line 2"
          name={path('addressLineTwo')}
        />
      </div>
      <div className="field-grid address-locality-row">
        <FormField
          autoComplete="address-level2"
          control={control}
          isRequired
          label="City"
          name={path('locality')}
        />
        {!lockToBritishColumbia && (
          <SelectField
            autoComplete="address-level1"
            control={control}
            isRequired
            label="Province"
            name={path('region')}
            options={[...CANADIAN_PROVINCES]}
          />
        )}
        <FormField
          autoComplete="postal-code"
          control={control}
          format={formatPostalCode}
          isRequired
          label="Postal code"
          name={path('postalCode')}
        />
        {lockToBritishColumbia && <p className="address-province">British Columbia, Canada</p>}
      </div>
    </FormSection>
  )
}
