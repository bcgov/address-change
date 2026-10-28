// Request summary priority from migrations/README.md.
export function summarizeRequestStatus(operationStatuses: readonly string[]): string {
  const has = (status: string) => operationStatuses.includes(status)
  const every = (allowed: string[]) => operationStatuses.every((status) => allowed.includes(status))
  if (operationStatuses.length === 0) return 'SUBMITTED'
  if (every(['SUCCEEDED'])) return 'COMPLETED'
  if (every(['SUCCEEDED', 'CANCELLED'])) return 'CLOSED'
  if (has('IN_PROGRESS')) return 'PROCESSING'
  if (has('SUCCEEDED')) return 'PARTIALLY_COMPLETED'
  if (has('UNKNOWN')) return 'PENDING_CONFIRMATION'
  if (has('PENDING')) return 'PENDING_DELIVERY'
  return 'FAILED'
}
