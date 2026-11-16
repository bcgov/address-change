import type { FC, ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { AlertBanner, Button } from '@bcgov/design-system-react-components'
import { isDataResetEnabled } from '@/auth/auth-service'
import PageHeading from '@/components/common/PageHeading'
import DeleteDataModal from './DeleteDataModal'
import DeleteDraftModal from './DeleteDraftModal'
import {
  listAddressChangeRequests,
  type AddressChangeOperation,
  type AddressChangeSummary,
} from './api'
import { formatDate, PARTNER_NAMES } from './format'

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  PROCESSING: 'Processing',
  PENDING_DELIVERY: 'Pending delivery',
  PENDING_CONFIRMATION: 'Pending confirmation',
  PARTIALLY_COMPLETED: 'Partially completed',
  COMPLETED: 'Completed',
  FAILED: 'Needs attention',
  CLOSED: 'Closed',
}

const OPERATION_LABELS: Record<string, string> = {
  PENDING: 'Pending',
  IN_PROGRESS: 'In progress',
  SUCCEEDED: 'Updated',
  FAILED: 'Needs attention',
  UNKNOWN: 'Unknown',
  CANCELLED: 'Cancelled',
}

const TERMINAL_STATUSES = ['COMPLETED', 'CLOSED']

const label = (labels: Record<string, string>, code: string) => labels[code] ?? code

const OperationRow: FC<{ operation: AddressChangeOperation }> = ({ operation }) => (
  <li className="request-service">
    <span>{PARTNER_NAMES[operation.partnerCode] ?? operation.partnerCode}</span>
    <span className={`status-tag status-tag--${operation.status.toLowerCase()}`}>
      {label(OPERATION_LABELS, operation.status)}
    </span>
  </li>
)

const Detail: FC<{ term: string; children: ReactNode; className?: string }> = ({
  term,
  children,
  className,
}) => (
  <div className="request-detail">
    <dt>{term}</dt>
    <dd className={className}>{children}</dd>
  </div>
)

const RequestCard: FC<{
  request: AddressChangeSummary
  onResume: (id: string) => void
  onDelete: (id: string) => void
}> = ({ request, onResume, onDelete }) => {
  const isDraft = request.status === 'DRAFT'
  return (
    <article
      aria-label={isDraft ? 'Draft request' : `Request ${request.requestId}`}
      className={`request-card request-card--${request.status.toLowerCase()}`}
    >
      <header className="request-card-header">
        <div>
          <p className="request-card-eyebrow">{isDraft ? 'In progress' : 'Submitted'}</p>
          <h3>{isDraft ? 'Draft' : formatDate(request.effectiveDate)}</h3>
        </div>
        <span className={`status-tag status-tag--${request.status.toLowerCase()}`}>
          {label(STATUS_LABELS, request.status)}
        </span>
      </header>
      <dl className="request-card-details">
        {isDraft ? (
          <>
            <Detail term="Started">{formatDate(request.createdAt)}</Detail>
            <Detail term="Last changed">{formatDate(request.updatedAt)}</Detail>
          </>
        ) : (
          <>
            <Detail term="Effective date">{formatDate(request.effectiveDate)}</Detail>
            <Detail term="Started">{formatDate(request.createdAt)}</Detail>
            <Detail term="Submitted">{formatDate(request.submittedAt ?? request.createdAt)}</Detail>
            <Detail term="Last changed">{formatDate(request.updatedAt)}</Detail>
            <Detail className="request-id" term="Request ID">
              {request.requestId}
            </Detail>
          </>
        )}
      </dl>
      {request.operations.length > 0 && (
        <section aria-label="Services" className="request-card-services">
          <h4>Services</h4>
          <ul>
            {request.operations.map((operation) => (
              <OperationRow key={operation.partnerCode} operation={operation} />
            ))}
          </ul>
        </section>
      )}
      {isDraft && (
        <footer className="request-card-footer">
          <Button onPress={() => onResume(request.requestId)}>Continue draft</Button>
          <Button danger onPress={() => onDelete(request.requestId)} variant="secondary">
            Delete draft
          </Button>
        </footer>
      )}
    </article>
  )
}
const RequestsPage: FC = () => {
  const navigate = useNavigate()
  const [requests, setRequests] = useState<AddressChangeSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [draftToDelete, setDraftToDelete] = useState<string | null>(null)

  useEffect(() => {
    void listAddressChangeRequests()
      .then(setRequests)
      .catch(() => setLoadError(true))
      .finally(() => setIsLoading(false))
  }, [])

  const startNew = () => void navigate({ to: '/address-change/new' })
  const resume = (draft: string) => void navigate({ to: '/address-change/new', search: { draft } })
  const hasActiveRequest = requests.some((request) => !TERMINAL_STATUSES.includes(request.status))
  const canStart = !isLoading && !loadError && !hasActiveRequest

  return (
    <section aria-labelledby="requests-heading">
      <PageHeading
        actions={
          <div className="page-heading-actions">
            {isDataResetEnabled() && !isLoading && !loadError && requests.length > 0 && (
              <button
                aria-label="Delete my test data"
                className="icon-button icon-button--danger"
                onClick={() => setIsDeleteOpen(true)}
                title="Delete my test data"
                type="button"
              >
                <svg
                  aria-hidden="true"
                  fill="currentColor"
                  height="20"
                  viewBox="0 0 16 16"
                  width="20"
                >
                  <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m3 .5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 1 0" />
                  <path d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4zM2.5 3h11V2h-11z" />
                </svg>
              </button>
            )}
            {canStart && requests.length > 0 && <Button onPress={startNew}>New request</Button>}
          </div>
        }
        description="Start an address change or pick up where you left off."
        title="Address change requests"
      />
      {isLoading && <p role="status">Loading your requests…</p>}
      {loadError && (
        <AlertBanner variant="danger">We could not load your address change requests.</AlertBanner>
      )}
      {canStart && requests.length === 0 && (
        <div className="app-card empty-state">
          <h3>Change your address</h3>
          <p>
            Tell us once and we&apos;ll pass your new address on to the BC government services you
            choose. It takes about five minutes.
          </p>
          <Button onPress={startNew} size="large">
            Start a request
          </Button>
        </div>
      )}
      {!isLoading &&
        !loadError &&
        requests.map((request) => (
          <RequestCard
            key={request.requestId}
            onDelete={setDraftToDelete}
            onResume={resume}
            request={request}
          />
        ))}
      <DeleteDraftModal
        onClose={() => setDraftToDelete(null)}
        onDeleted={(requestId) => {
          setRequests((current) => current.filter((request) => request.requestId !== requestId))
          setDraftToDelete(null)
        }}
        requestId={draftToDelete}
      />
      {isDataResetEnabled() && (
        <DeleteDataModal
          isOpen={isDeleteOpen}
          onClose={() => setIsDeleteOpen(false)}
          onDeleted={() => {
            setRequests([])
            setIsDeleteOpen(false)
          }}
        />
      )}
    </section>
  )
}

export default RequestsPage
