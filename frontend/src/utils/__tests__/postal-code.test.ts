import { formatPostalCode, isValidPostalCode } from '../postal-code'

describe('formatPostalCode', () => {
  test('uppercases, strips junk and inserts the space', () => {
    expect(formatPostalCode('v8v1a1')).toBe('V8V 1A1')
    expect(formatPostalCode('v8v-1a1 extra')).toBe('V8V 1A1')
    expect(formatPostalCode('v8')).toBe('V8')
  })
})

describe('isValidPostalCode', () => {
  test.each(['V8V 1A1', 'v8v1a1', 'K1A 0B1'])('accepts %s', (value) => {
    expect(isValidPostalCode(value)).toBe(true)
  })

  test.each(['', 'V8V', '12345', 'D1D 1D1', 'W1A 1A1', 'V8V 1U1'])('rejects %s', (value) => {
    expect(isValidPostalCode(value)).toBe(false)
  })
})
