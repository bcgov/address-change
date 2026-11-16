import { useState } from 'react'
import type { FC } from 'react'
import { AlertBanner, AlertDialog, Button, Modal } from '@bcgov/design-system-react-components'
import { deleteOwnAddressChangeData } from './api'

type Props = {
  isOpen: boolean
  onClose: () => void
  onDeleted: () => void
}

const DeleteDataModal: FC<Props> = ({ isOpen, onClose, onDeleted }) => {
  const [isDeleting, setIsDeleting] = useState(false)
  const [hasError, setHasError] = useState(false)

  const close = () => {
    if (isDeleting) return
    setHasError(false)
    onClose()
  }

  const confirmDelete = async () => {
    setIsDeleting(true)
    setHasError(false)
    try {
      await deleteOwnAddressChangeData()
      onDeleted()
    } catch {
      setHasError(true)
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <Modal isDismissable={!isDeleting} isOpen={isOpen} onOpenChange={(open) => !open && close()}>
      <AlertDialog
        buttons={
          <>
            <Button isDisabled={isDeleting} onPress={close} variant="secondary">
              Cancel
            </Button>
            <Button danger isDisabled={isDeleting} onPress={() => void confirmDelete()}>
              {isDeleting ? 'Deleting…' : 'Delete my data'}
            </Button>
          </>
        }
        title="Delete all of your test data?"
        variant="destructive"
      >
        <p>
          This permanently deletes every request, draft and delivery record linked to your account.
          Other people&apos;s data is not affected. This cannot be undone.
        </p>
        {hasError && (
          <AlertBanner variant="danger">
            We could not delete your data. This feature may not be available in this environment.
          </AlertBanner>
        )}
      </AlertDialog>
    </Modal>
  )
}

export default DeleteDataModal
