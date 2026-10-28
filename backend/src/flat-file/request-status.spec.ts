import { summarizeRequestStatus } from './request-status'

describe('summarizeRequestStatus', () => {
  it.each([
    [[], 'SUBMITTED'],
    [['SUCCEEDED', 'SUCCEEDED'], 'COMPLETED'],
    [['SUCCEEDED', 'CANCELLED'], 'CLOSED'],
    [['IN_PROGRESS', 'SUCCEEDED'], 'PROCESSING'],
    [['SUCCEEDED', 'PENDING'], 'PARTIALLY_COMPLETED'],
    [['UNKNOWN', 'PENDING'], 'PENDING_CONFIRMATION'],
    [['PENDING', 'FAILED'], 'PENDING_DELIVERY'],
    [['FAILED', 'CANCELLED'], 'FAILED'],
  ])('%j -> %s', (statuses, expected) => {
    expect(summarizeRequestStatus(statuses)).toBe(expected)
  })
})
