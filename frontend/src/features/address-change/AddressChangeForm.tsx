import { useEffect, useState } from 'react'
import type { FC } from 'react'
import { useForm } from 'react-hook-form'
import { AlertBanner, Button } from '@bcgov/design-system-react-components'
import { useAuth } from '@/auth/auth-context'
import AddressFields from '@/components/common/AddressFields'
import CheckboxField from '@/components/common/CheckboxField'
import FormField from '@/components/common/FormField'
import FormSection from '@/components/common/FormSection'
import { zodResolver } from '@/utils/zod-resolver'
import type { AddressSuggestion } from '@/service/geocoder'
import { submitAddressChange } from './api'
import {
  addressChangeFormSchema,
  defaultFormValues,
  toAddressChangeRequest,
  type AddressChangeFormValues,
} from './schema'
import { useRequestDraft } from './useRequestDraft'

type Props = {
  onSubmitted?: (requestId: string) => void
  onCancel?: () => void
}

const AddressChangeForm: FC<Props> = ({ onSubmitted, onCancel }) => {
  const { user } = useAuth()
  const draft = useRequestDraft()
  const [submitError, setSubmitError] = useState<string | null>(null)
  const { control, handleSubmit, watch, setValue, formState } = useForm<AddressChangeFormValues>({
    resolver: zodResolver(addressChangeFormSchema),
    mode: 'onChange',
    defaultValues: { ...defaultFormValues(), dateOfBirth: user?.birthdate ?? '' },
  })
  const mailingSame = watch('mailingSameAsResidential')
  const { scheduleSave } = draft

  useEffect(() => {
    const subscription = watch((values) => scheduleSave(values as Partial<AddressChangeFormValues>))
    return () => subscription.unsubscribe()
  }, [watch, scheduleSave])

  if (!user) return null
  const { currentAddress } = user

  const fillAddress = (prefix: 'residentialAddress' | 'mailingAddress') => {
    return (suggestion: AddressSuggestion) => {
      const options = { shouldDirty: true, shouldValidate: formState.isSubmitted }
      setValue(`${prefix}.addressLineOne`, suggestion.addressLineOne, options)
      setValue(`${prefix}.addressLineTwo`, '', options)
      setValue(`${prefix}.locality`, suggestion.locality, options)
      setValue(`${prefix}.region`, suggestion.region, options)
      setValue(`${prefix}.country`, suggestion.country, options)
    }
  }

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null)
    try {
      const ack = await submitAddressChange(
        toAddressChangeRequest(values, user, draft.idempotencyKey),
      )
      onSubmitted?.(ack.requestId)
    } catch {
      setSubmitError('We could not submit your request. Please try again.')
    }
  })

  return (
    <form aria-label="Address change request" noValidate onSubmit={onSubmit}>
      <FormSection title="Your details">
        <dl className="details-list">
          <dt>Name</dt>
          <dd>{user.displayName}</dd>
          {user.birthdate && (
            <>
              <dt>Date of birth</dt>
              <dd>{user.birthdate}</dd>
            </>
          )}
          <dt>Current address</dt>
          <dd>
            {currentAddress
              ? [
                  currentAddress.addressLineOne,
                  currentAddress.addressLineTwo,
                  currentAddress.locality,
                  currentAddress.region,
                  currentAddress.postalCode,
                  currentAddress.country,
                ]
                  .filter(Boolean)
                  .join(', ')
              : 'No address on file'}
          </dd>
        </dl>
        {!user.birthdate && (
          <div className="field-grid">
            <FormField
              control={control}
              isRequired
              label="Date of birth"
              name="dateOfBirth"
              type="date"
            />
          </div>
        )}
      </FormSection>

      <FormSection title="When does your address change?">
        <div className="field-grid">
          <FormField
            control={control}
            description="The date your new address takes effect."
            isRequired
            label="Effective date"
            name="effectiveDate"
            type="date"
          />
        </div>
      </FormSection>

      <AddressFields
        control={control}
        legend="New residential address"
        onAddressSelected={fillAddress('residentialAddress')}
        prefix="residentialAddress"
      />

      <FormSection title="Mailing address">
        <CheckboxField
          control={control}
          label="My mailing address is the same as my residential address"
          name="mailingSameAsResidential"
        />
      </FormSection>
      {!mailingSame && (
        <AddressFields
          control={control}
          legend="New mailing address"
          onAddressSelected={fillAddress('mailingAddress')}
          prefix="mailingAddress"
        />
      )}

      <FormSection
        description="Choose which services should be told about your new address."
        title="Who needs to know?"
      >
        <div className="checkbox-group">
          <CheckboxField control={control} label="BC Drivers License (ICBC)" name="notifyIcbc" />
          <CheckboxField control={control} label="Medical Services Plan (MSP)" name="notifyMsp" />
        </div>
        {formState.errors.notifyIcbc && <p role="alert">{formState.errors.notifyIcbc.message}</p>}
      </FormSection>

      {submitError && (
        <div className="form-alert" role="alert">
          <AlertBanner variant="danger">{submitError}</AlertBanner>
        </div>
      )}

      <div className="form-actions">
        <Button isDisabled={formState.isSubmitting} type="submit">
          Submit request
        </Button>
        {onCancel && (
          <Button onPress={onCancel} variant="secondary">
            Cancel
          </Button>
        )}
      </div>
    </form>
  )
}

export default AddressChangeForm
