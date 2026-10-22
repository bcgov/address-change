import { useEffect, useRef, useState } from 'react'
import type { FC } from 'react'
import { useForm } from 'react-hook-form'
import { AlertBanner, Button } from '@bcgov/design-system-react-components'
import { useAuth } from '@/auth/auth-context'
import { zodResolver } from '@/utils/zod-resolver'
import type { AddressSuggestion } from '@/service/geocoder'
import { submitAddressChange } from './api'
import {
  addressChangeFormSchema,
  areFieldsValid,
  defaultFormValues,
  mergeDraftValues,
  stepFields,
  toAddressChangeRequest,
  type AddressChangeFormValues,
} from './schema'
import StepIndicator from './StepIndicator'
import {
  CollectionNoticeStep,
  ConfirmationPanel,
  NewAddressStep,
  PartnersStep,
  ReviewInformationStep,
  ReviewSubmitStep,
  SubmittingPanel,
} from './steps'
import { useRequestDraft } from './useRequestDraft'

export const STEP_LABELS = [
  'Collection notice',
  'Review your information',
  'Provide new address',
  'Who needs to know?',
  'Review and submit',
]
const LAST_STEP = STEP_LABELS.length - 1

export type InitialDraft = {
  idempotencyKey: string
  step: number
  values: Record<string, unknown>
}

type Props = {
  initialDraft?: InitialDraft
  onSubmitted?: (requestId: string) => void
  onReturnHome?: () => void
  onCancel?: () => void
}

const AddressChangeForm: FC<Props> = ({ initialDraft, onSubmitted, onReturnHome, onCancel }) => {
  const { user } = useAuth()
  const draft = useRequestDraft(initialDraft?.idempotencyKey)
  const [step, setStep] = useState(() => Math.min(Math.max(initialDraft?.step ?? 0, 0), LAST_STEP))
  const [phase, setPhase] = useState<'editing' | 'submitting' | 'done'>('editing')
  const [requestId, setRequestId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const { control, handleSubmit, watch, setValue, getValues, trigger, formState } =
    useForm<AddressChangeFormValues>({
      resolver: zodResolver(addressChangeFormSchema),
      mode: 'onChange',
      defaultValues: {
        ...(initialDraft ? mergeDraftValues(initialDraft.values) : defaultFormValues()),
        ...(user?.birthdate ? { dateOfBirth: user.birthdate } : {}),
      },
    })
  const mailingSame = watch('mailingSameAsResidential')
  const notifyIcbc = watch('notifyIcbc')
  const acknowledged = watch('collectionNoticeAcknowledged')
  const currentValues = watch()

  useEffect(() => {
    window.scrollTo({ top: 0 })
    headingRef.current?.focus({ preventScroll: true })
  }, [step, phase])

  if (!user) return null
  const fields = stepFields(Boolean(user.birthdate))

  const fillAddress = (prefix: 'residentialAddress' | 'mailingAddress') => {
    return (suggestion: AddressSuggestion) => {
      const options = { shouldDirty: true, shouldValidate: formState.isSubmitted }
      setValue(`${prefix}.addressLineOne`, suggestion.addressLineOne, options)
      setValue(`${prefix}.addressLineTwo`, '', options)
      setValue(`${prefix}.locality`, suggestion.locality, options)
      setValue(`${prefix}.region`, 'BC', options)
      setValue(`${prefix}.country`, suggestion.country, options)
    }
  }

  const goTo = async (target: number, { blockOnFailure }: { blockOnFailure: boolean }) => {
    setError(null)
    setIsSaving(true)
    try {
      await draft.save(target, getValues())
      setStep(target)
    } catch {
      if (blockOnFailure) {
        setError('We could not save your progress. Please try again.')
      } else {
        setStep(target)
      }
    } finally {
      setIsSaving(false)
    }
  }

  const next = async () => {
    const valid = fields[step].length === 0 || (await trigger([...fields[step]]))
    if (valid) await goTo(step + 1, { blockOnFailure: true })
  }

  const firstInvalidStep = () => {
    const errors = formState.errors as Record<string, unknown>
    return fields.findIndex((names) => names.some((name) => name in errors))
  }

  const submit = handleSubmit(
    async (values) => {
      setError(null)
      setPhase('submitting')
      try {
        const ack = await submitAddressChange(
          toAddressChangeRequest(values, user, draft.idempotencyKey),
        )
        setRequestId(ack.requestId)
        setPhase('done')
        onSubmitted?.(ack.requestId)
      } catch {
        setPhase('editing')
        setError('We could not submit your request. Please try again.')
      }
    },
    () => {
      const target = firstInvalidStep()
      if (target >= 0 && target !== step) setStep(target)
    },
  )

  if (phase === 'submitting') return <SubmittingPanel />
  if (phase === 'done') {
    return <ConfirmationPanel onReturnHome={() => onReturnHome?.()} requestId={requestId} />
  }

  const onFormSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    if (isSaving) return
    if (step === LAST_STEP) void submit()
    else if (step !== 0 || acknowledged) void next()
  }

  return (
    <form aria-label="Address change request" noValidate onSubmit={onFormSubmit}>
      <StepIndicator
        current={step}
        isDisabled={isSaving}
        onSelect={(target) => void goTo(target, { blockOnFailure: false })}
        steps={STEP_LABELS}
      />
      <h3 className="step-heading" ref={headingRef} tabIndex={-1}>
        {STEP_LABELS[step]}
      </h3>

      {step === 0 && <CollectionNoticeStep control={control} />}
      {step === 1 && <ReviewInformationStep control={control} user={user} />}
      {step === 2 && (
        <NewAddressStep
          control={control}
          mailingSame={mailingSame}
          onMailingSelected={fillAddress('mailingAddress')}
          onResidentialSelected={fillAddress('residentialAddress')}
        />
      )}
      {step === 3 && <PartnersStep control={control} notifyIcbc={notifyIcbc} />}
      {step === 4 && (
        <ReviewSubmitStep
          onEdit={(target) => void goTo(target, { blockOnFailure: false })}
          user={user}
          values={getValues()}
        />
      )}

      {error && (
        <div className="form-alert" role="alert">
          <AlertBanner variant="danger">{error}</AlertBanner>
        </div>
      )}

      <div className="form-actions">
        {step > 0 && (
          <Button
            isDisabled={isSaving}
            onPress={() => void goTo(step - 1, { blockOnFailure: false })}
            variant="secondary"
          >
            Previous
          </Button>
        )}
        {onCancel && step === 0 && (
          <Button onPress={onCancel} variant="tertiary">
            Cancel
          </Button>
        )}
        {step < LAST_STEP ? (
          <Button
            isDisabled={isSaving || !areFieldsValid(currentValues, fields[step])}
            onPress={() => void next()}
          >
            Continue
          </Button>
        ) : (
          <Button isDisabled={isSaving} type="submit">
            Submit request
          </Button>
        )}
      </div>
    </form>
  )
}

export default AddressChangeForm
