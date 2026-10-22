import type { FC } from 'react'
import { useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Button } from '@bcgov/design-system-react-components'
import PageHeading from '@/components/common/PageHeading'
import { listAddressChangeRequests, type AddressChangeSummary } from './api'

const RequestsPage: FC = () => {
  const navigate = useNavigate()
  const [requests, setRequests] = useState<AddressChangeSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    void listAddressChangeRequests()
      .then(setRequests)
      .catch(() => setLoadError(true))
      .finally(() => setIsLoading(false))
  }, [])

  const hasActiveRequest = requests.some(
    (request) => request.status !== 'COMPLETED' && request.status !== 'CLOSED',
  )

  return (
    <section aria-labelledby="requests-heading">
      <PageHeading
        actions={
          !hasActiveRequest && (
            <Button onPress={() => void navigate({ to: '/address-change/new' })}>New request</Button>
          )
        }
        description="Track the address changes you have submitted."
        title="Address change requests"
      />
      <div className="app-card centered-card">
        {isLoading && <p>Loading your requests…</p>}
        {loadError && <p>We could not load your address change requests.</p>}
        {!isLoading && !loadError && requests.length === 0 && (
          <p>You have no address change requests yet.</p>
        )}
        {!isLoading && !loadError && requests.length > 0 && (
          <ul>
            {requests.map((request) => (
              <li key={request.requestId}>
                <strong>{request.status}</strong> — effective {request.effectiveDate}
                <ul>
                  {request.operations.map((operation) => (
                    <li key={`${request.requestId}-${operation.partnerCode}`}>
                      {operation.partnerCode}: {operation.status}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

export default RequestsPage
