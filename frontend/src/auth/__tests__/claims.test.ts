import { getUserSummary } from '@/auth/claims'

describe('getUserSummary', () => {
  test('reads display name and the OIDC address claim', () => {
    const summary = getUserSummary({
      profile: {
        sub: 'abc',
        display_name: 'Jane Doe',
        given_name: 'Jane',
        family_name: 'Doe',
        email: 'jane@example.com',
        birthdate: '1983-10-16',
        address: {
          street_address: '1 Main St\nUnit 2',
          locality: 'Victoria',
          region: 'BC',
          postal_code: 'V8V 1A1',
          country: 'CA',
        },
      },
    } as never)

    expect(summary).toMatchObject({
      displayName: 'Jane Doe',
      firstName: 'Jane',
      birthdate: '1983-10-16',
      currentAddress: {
        addressLineOne: '1 Main St',
        addressLineTwo: 'Unit 2',
        locality: 'Victoria',
        postalCode: 'V8V 1A1',
      },
    })
  })

  test('uses BC Services Card given_names when given_name is absent', () => {
    const summary = getUserSummary({
      profile: { sub: 'x', given_names: 'ADIEL', family_name: 'GALLUP' },
    } as never)
    expect(summary.firstName).toBe('ADIEL')
  })

  test('falls back to given/family names and null address', () => {
    const summary = getUserSummary({
      profile: { sub: 'x', given_name: 'A', family_name: 'B' },
    } as never)
    expect(summary.displayName).toBe('A B')
    expect(summary.currentAddress).toBeNull()
  })
})
