import { createFileRoute } from '@tanstack/react-router'
import NewRequestPage from '@/features/address-change/NewRequestPage'

export const Route = createFileRoute('/_authenticated/address-change/new')({
  component: NewRequestPage,
})
