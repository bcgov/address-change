import { formatAddress, formatDate } from '@/features/address-change/format'

describe('formatAddress', () => {
  test('joins the present parts', () => {
    expect(formatAddress({ addressLineOne: '1 Main St', locality: 'Victoria', region: 'BC' })).toBe(
      '1 Main St, Victoria, BC',
    )
  })

  test('returns an empty string for missing addresses', () => {
    expect(formatAddress(null)).toBe('')
    expect(formatAddress(undefined)).toBe('')
  })
})

describe('formatDate', () => {
  test('formats date-only and ISO values', () => {
    expect(formatDate('2026-03-05')).toContain('2026')
    expect(formatDate('2026-03-05T10:00:00Z')).toContain('2026')
  })

  test('handles empty and invalid values', () => {
    expect(formatDate(null)).toBe('')
    expect(formatDate('not-a-date')).toBe('not-a-date')
  })
})
