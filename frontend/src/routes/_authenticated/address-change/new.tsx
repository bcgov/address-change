import { createFileRoute } from '@tanstack/react-router'
import NewRequestPage from '@/features/address-change/NewRequestPage'

export const Route = createFileRoute('/_authenticated/address-change/new')({
  validateSearch: (search: Record<string, unknown>): { draft?: string } =>
    typeof search.draft === 'string' ? { draft: search.draft } : {},
  component: NewRequestPage,
})
