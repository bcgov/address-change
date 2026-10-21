import { addressChangeFormSchema, defaultFormValues, toAddressChangeRequest } from '../schema'

const filled = () => ({
  ...defaultFormValues(),
  dateOfBirth: '1990-01-02',
  residentialAddress: {
    addressLineOne: '1 Main St',
    addressLineTwo: '',
    locality: 'Victoria',
    region: 'BC',
    postalCode: 'V8V 1A1',
    country: 'Canada',
  },
})

describe('addressChangeFormSchema', () => {
  test('accepts a complete form when mailing matches residential', () => {
    expect(addressChangeFormSchema.safeParse(filled()).success).toBe(true)
  })

  test('rejects an invalid postal code', () => {
    const base = filled()
    const result = addressChangeFormSchema.safeParse({
      ...base,
      residentialAddress: { ...base.residentialAddress, postalCode: 'D1D 1D1' },
    })
    expect(result.error?.issues[0]).toMatchObject({
      path: ['residentialAddress', 'postalCode'],
      message: 'Enter a valid postal code, like V8V 1A1',
    })
  })

  test('requires a mailing address when it differs', () => {
    const result = addressChangeFormSchema.safeParse({
      ...filled(),
      mailingSameAsResidential: false,
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues.some((i) => i.path[0] === 'mailingAddress')).toBe(true)
  })
})

describe('toAddressChangeRequest', () => {
  const user = {
    sub: 's',
    displayName: 'Jane Doe',
    firstName: 'Jane',
    lastName: 'Doe',
    email: '',
    birthdate: '',
    currentAddress: null,
  }

  test('omits mailing address when same and includes the idempotency key', () => {
    const body = toAddressChangeRequest(filled(), user, 'key-1')
    expect(body.idempotencyKey).toBe('key-1')
    expect(body.isBillingAddressSame).toBe(true)
    expect(body.mailingAddress).toBeUndefined()
    expect(body.newAddress.addressLineTwo).toBeUndefined()
  })
})
