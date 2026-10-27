import { useEffect, useRef, useState } from 'react'
import type { FC } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { AlertBanner } from '@bcgov/design-system-react-components'
import PageHeading from '@/components/common/PageHeading'
import AddressChangeForm, { type InitialDraft } from './AddressChangeForm'
import { getAddressChangeDraft } from './api'

type DraftState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; draft: InitialDraft }

const NewRequestPage: FC = () => {
  const navigate = useNavigate()
  const { draft: draftId } = useSearch({ from: '/_authenticated/address-change/new' })
  const [state, setState] = useState<DraftState>(
    draftId ? { status: 'loading' } : { status: 'idle' },
  )
  // A draft created by this form is already in memory; don't reload it after the URL changes.
  const createdDraftIdRef = useRef<string>()

  useEffect(() => {
    if (!draftId || draftId === createdDraftIdRef.current) return
    let cancelled = false
    getAddressChangeDraft(draftId)
      .then((response) => {
        if (cancelled) return
        setState({
          status: 'ready',
          draft: {
            idempotencyKey: response.idempotencyKey,
            step: response.draft.step,
            values: response.draft.values,
          },
        })
      })
      .catch(() => !cancelled && setState({ status: 'error' }))
    return () => {
      cancelled = true
    }
  }, [draftId])

  const goHome = () => void navigate({ to: '/address-change' })

  return (
    <section>
      <PageHeading
        description={
          draftId
            ? 'Pick up where you left off. Your progress is saved at each step.'
            : 'Tell us your new address. Your progress is saved at each step.'
        }
        title="New address change request"
      />
      {state.status === 'loading' && (
        <p aria-live="polite" role="status">
          Loading your draft…
        </p>
      )}
      {state.status === 'error' && (
        <AlertBanner variant="danger">
          We could not load your draft. It may have been submitted already.{' '}
          <a
            href="/address-change"
            onClick={(event) => {
              event.preventDefault()
              goHome()
            }}
          >
            Return to home
          </a>
        </AlertBanner>
      )}
      {(state.status === 'idle' || state.status === 'ready') && (
        <AddressChangeForm
          initialDraft={state.status === 'ready' ? state.draft : undefined}
          onCancel={goHome}
          onDraftCreated={(requestId) => {
            createdDraftIdRef.current = requestId
            void navigate({
              to: '/address-change/new',
              search: { draft: requestId },
              replace: true,
            })
          }}
          onReturnHome={goHome}
        />
      )}
    </section>
  )
}

export default NewRequestPage
