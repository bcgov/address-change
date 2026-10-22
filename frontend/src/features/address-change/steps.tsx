import type { FC } from 'react'
import type { Control } from 'react-hook-form'
import { Button } from '@bcgov/design-system-react-components'
import AddressFields from '@/components/common/AddressFields'
import CheckboxField from '@/components/common/CheckboxField'
import FormField from '@/components/common/FormField'
import FormSection from '@/components/common/FormSection'
import LoadingPanel from '@/components/common/LoadingPanel'
import type { UserSummary } from '@/auth/claims'
import type { AddressSuggestion } from '@/service/geocoder'
import { COLLECTION_NOTICE } from './collection-notice'
import { formatAddress, formatDate, PARTNER_NAMES } from './format'
import IcbcLicenceDiagram from './IcbcLicenceDiagram'
import type { AddressChangeFormValues } from './schema'

type FormControl = Control<AddressChangeFormValues>

const digitsOnly = (maxLength: number) => (value: string) =>
  value.replace(/\D/g, '').slice(0, maxLength)

export const CollectionNoticeStep: FC<{ control: FormControl }> = ({ control }) => (
  <FormSection
    description="Please read how your information will be collected and used."
    hideTitle
    title="Collection notice"
  >
    <div
      aria-label="Collection notice"
      className="collection-notice"
      role="region"
      // Scrollable regions must be keyboard focusable.
      tabIndex={0}
    >
      {COLLECTION_NOTICE.map((section) => (
        <div key={section.heading}>
          <h4>{section.heading}</h4>
          {section.body.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
      ))}
    </div>
    <CheckboxField
      control={control}
      label="I have read and acknowledge the collection notice"
      name="collectionNoticeAcknowledged"
    />
  </FormSection>
)

export const ReviewInformationStep: FC<{ control: FormControl; user: UserSummary }> = ({
  control,
  user,
}) => (
  <FormSection
    description="Check that the information from your BC Services Card is correct."
    hideTitle
    title="Review your information"
  >
    <dl className="details-list">
      <dt>Name</dt>
      <dd>{user.displayName}</dd>
      {user.birthdate && (
        <>
          <dt>Date of birth</dt>
          <dd>{user.birthdate}</dd>
        </>
      )}
      <dt>Email</dt>
      <dd>{user.email || 'No email on file'}</dd>
      <dt>Current address</dt>
      <dd>{formatAddress(user.currentAddress) || 'No address on file'}</dd>
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
)

export const NewAddressStep: FC<{
  control: FormControl
  mailingSame: boolean
  onResidentialSelected: (suggestion: AddressSuggestion) => void
  onMailingSelected: (suggestion: AddressSuggestion) => void
}> = ({ control, mailingSame, onResidentialSelected, onMailingSelected }) => (
  <>
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
      lockToBritishColumbia
      onAddressSelected={onResidentialSelected}
      prefix="residentialAddress"
    />
    <FormSection title="Mailing address">
      <CheckboxField
        control={control}
        label="Your mailing address is the same as your residential address"
        name="mailingSameAsResidential"
      />
    </FormSection>
    {!mailingSame && (
      <AddressFields
        control={control}
        legend="New mailing address"
        lockToBritishColumbia
        onAddressSelected={onMailingSelected}
        prefix="mailingAddress"
      />
    )}
  </>
)

export const PartnersStep: FC<{ control: FormControl; notifyIcbc: boolean }> = ({
  control,
  notifyIcbc,
}) => (
  <>
    <FormSection
      description="Choose which services should be told about your new address."
      hideTitle
      title="Who needs to know?"
    >
      <div className="checkbox-group">
        <CheckboxField
          control={control}
          isDisabled
          label="BC Services Card (BCSC)"
          name="notifyBcsc"
        />
        <CheckboxField control={control} label="BC Drivers License (ICBC)" name="notifyIcbc" />
      </div>
    </FormSection>
    {notifyIcbc && (
      <FormSection
        description="ICBC needs these details to match your record. Enter them exactly as they appear on your driver’s licence."
        title="ICBC requirements"
      >
        <div className="icbc-requirements">
          <div className="icbc-requirements-fields">
            <FormField
              autoComplete="off"
              control={control}
              format={digitsOnly(8)}
              isRequired
              label="Driver’s licence number"
              name="icbc.driversLicenseNumber"
            />
            <FormField
              control={control}
              description="As shown on your licence, in centimetres."
              format={digitsOnly(3)}
              isRequired
              label="Height"
              name="icbc.heightCm"
              suffix="cm"
            />
            <FormField
              control={control}
              description="As shown on your licence, in kilograms."
              format={digitsOnly(3)}
              isRequired
              label="Weight"
              name="icbc.weightKg"
              suffix="kg"
            />
            <FormField
              autoComplete="off"
              control={control}
              description="Usually your mother's maiden name."
              isRequired
              isSecret
              label="Security keyword"
              name="icbc.securityKeyword"
            />
          </div>
          <IcbcLicenceDiagram />
        </div>
      </FormSection>
    )}
  </>
)

type ReviewProps = {
  values: AddressChangeFormValues
  user: UserSummary
  onEdit: (step: number) => void
}

const ReviewSection: FC<{
  title: string
  step: number
  onEdit?: (step: number) => void
  rows: [string, string][]
}> = ({ title, step, onEdit, rows }) => (
  <FormSection title={title}>
    <dl className="details-list">
      {rows.map(([label, value]) => (
        <div className="details-row" key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
    {onEdit && (
      <Button onPress={() => onEdit(step)} size="small" variant="tertiary">
        Change<span className="visually-hidden"> {title.toLowerCase()}</span>
      </Button>
    )}
  </FormSection>
)

export const ReviewSubmitStep: FC<ReviewProps> = ({ values, user, onEdit }) => {
  const partners = [PARTNER_NAMES.BCSC, ...(values.notifyIcbc ? [PARTNER_NAMES.ICBC] : [])].join(
    ', ',
  )
  const dateOfBirth = user.birthdate || values.dateOfBirth
  return (
    <>
      <ReviewSection
        rows={[
          ['Name', user.displayName],
          ['Date of birth', formatDate(dateOfBirth)],
          ['Email', user.email || 'No email on file'],
          ['Current address', formatAddress(user.currentAddress) || 'No address on file'],
        ]}
        step={1}
        title="Your information"
      />
      <ReviewSection
        onEdit={onEdit}
        rows={[
          ['Effective date', formatDate(values.effectiveDate)],
          ['New residential address', formatAddress(values.residentialAddress)],
          [
            'Mailing address',
            values.mailingSameAsResidential
              ? 'Same as residential address'
              : formatAddress(values.mailingAddress),
          ],
        ]}
        step={2}
        title="New address"
      />
      <ReviewSection
        onEdit={onEdit}
        rows={[
          ['Services to notify', partners],
          ...(values.notifyIcbc
            ? ([
                ['Driver’s licence number', values.icbc.driversLicenseNumber],
                ['Height', `${values.icbc.heightCm} cm`],
                ['Weight', `${values.icbc.weightKg} kg`],
                ['Security keyword', '•'.repeat(Math.max(values.icbc.securityKeyword.length, 4))],
              ] as [string, string][])
            : []),
        ]}
        step={3}
        title="Who needs to know?"
      />
    </>
  )
}

export const SubmittingPanel: FC = () => (
  <LoadingPanel
    title="Submitting your request…"
    description="Please wait. Do not close this page."
  />
)

export const ConfirmationPanel: FC<{ requestId: string; onReturnHome: () => void }> = ({
  requestId,
  onReturnHome,
}) => (
  <div className="app-card centered-card" role="status">
    <h3>Your request has been submitted</h3>
    <p>Your request ID is:</p>
    <p className="request-id">{requestId}</p>
    <p>Keep this ID for your records. You can track progress from the home page.</p>
    <a
      href="/address-change"
      onClick={(event) => {
        event.preventDefault()
        onReturnHome()
      }}
    >
      Return to home
    </a>
  </div>
)
