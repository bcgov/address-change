import { useState } from 'react'
import type { FC } from 'react'
import { AlertBanner, AlertDialog, Button, Modal } from '@bcgov/design-system-react-components'
import { deleteAddressChangeDraft } from './api'

type Props = {
  requestId: string | null
  onClose: () => void
  onDeleted: (requestId: string) => void
}

const DeleteDraftModal: FC<Props> = ({ requestId, onClose, onDeleted }) => {
  const [isDeleting, setIsDeleting] = useState(false)
  const [hasError, setHasError] = useState(false)

  const close = () => {
    if (isDeleting) return
    setHasError(false)
    onClose()
  }

  const confirmDelete = async () => {
    if (!requestId) return
    setIsDeleting(true)
    setHasError(false)
    try {
      await deleteAddressChangeDraft(requestId)
      onDeleted(requestId)
    } catch {
      setHasError(true)
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <Modal
      isDismissable={!isDeleting}
      isOpen={requestId !== null}
      onOpenChange={(open) => !open && close()}
    >
      <AlertDialog
        buttons={
          <>
            <Button isDisabled={isDeleting} onPress={close} variant="secondary">
              Cancel
            </Button>
            <Button danger isDisabled={isDeleting} onPress={() => void confirmDelete()}>
              {isDeleting ? 'Deleting…' : 'Delete draft'}
            </Button>
          </>
        }
        title="Delete this draft?"
        variant="destructive"
      >
        <p>
          This permanently deletes your draft address change. You will need to start a new request
          to change your address. This cannot be undone.
        </p>
        {hasError && (
          <AlertBanner variant="danger">
            We could not delete your draft. Please try again.
          </AlertBanner>
        )}
      </AlertDialog>
    </Modal>
  )
}

export default DeleteDraftModal
