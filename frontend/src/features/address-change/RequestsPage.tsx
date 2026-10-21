import type { FC } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Button } from '@bcgov/design-system-react-components'
import PageHeading from '@/components/common/PageHeading'

const RequestsPage: FC = () => {
  const navigate = useNavigate()
  return (
    <section aria-labelledby="requests-heading">
      <PageHeading
        actions={
          <Button onPress={() => void navigate({ to: '/address-change/new' })}>New request</Button>
        }
        description="Track the address changes you have submitted."
        title="Address change requests"
      />
      <div className="app-card centered-card">
        <p>You have no address change requests yet.</p>
      </div>
    </section>
  )
}

export default RequestsPage
