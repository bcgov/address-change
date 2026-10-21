import { createFileRoute } from '@tanstack/react-router'
import RequestsPage from '@/features/address-change/RequestsPage'

export const Route = createFileRoute('/_authenticated/address-change/')({
  component: RequestsPage,
})
