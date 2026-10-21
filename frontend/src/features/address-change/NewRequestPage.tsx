import { useState } from 'react'
import type { FC } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { AlertBanner } from '@bcgov/design-system-react-components'
import PageHeading from '@/components/common/PageHeading'
import AddressChangeForm from './AddressChangeForm'

const NewRequestPage: FC = () => {
  const navigate = useNavigate()
  const [requestId, setRequestId] = useState<string | null>(null)
  return (
    <section>
      <PageHeading
        description="Tell us your new address. Fields marked required must be completed."
        title="New address change request"
      />
      {requestId ? (
        <AlertBanner variant="success">
          Your request was submitted. Reference number: {requestId}
        </AlertBanner>
      ) : (
        <AddressChangeForm
          onCancel={() => void navigate({ to: '/address-change' })}
          onSubmitted={setRequestId}
        />
      )}
    </section>
  )
}

export default NewRequestPage
