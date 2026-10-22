import { addressChangeFormSchema, defaultFormValues, toAddressChangeRequest } from '../schema'

const filled = () => ({
  ...defaultFormValues(),
  collectionNoticeAcknowledged: true,
  dateOfBirth: '1990-01-02',
  residentialAddress: {
    addressLineOne: '1 Main St',
    addressLineTwo: '',
    locality: 'Victoria',
    region: 'BC',
    postalCode: 'V8V 1A1',
    country: 'Canada',
  },
  icbc: { driversLicenseNumber: '1234567', heightCm: '175', weightKg: '70', securityKeyword: 'k' },
})

describe('addressChangeFormSchema', () => {
  test('accepts a complete form when mailing matches residential', () => {
    expect(addressChangeFormSchema.safeParse(filled()).success).toBe(true)
  })

  test('requires the collection notice acknowledgement', () => {
    const result = addressChangeFormSchema.safeParse({
      ...filled(),
      collectionNoticeAcknowledged: false,
    })
    expect(result.error?.issues[0].path).toEqual(['collectionNoticeAcknowledged'])
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

  test('rejects a new address outside British Columbia', () => {
    const base = filled()
    const result = addressChangeFormSchema.safeParse({
      ...base,
      residentialAddress: { ...base.residentialAddress, region: 'AB' },
    })
    expect(result.error?.issues[0].path).toEqual(['residentialAddress', 'region'])
  })

  test('requires a mailing address when it differs', () => {
    const result = addressChangeFormSchema.safeParse({
      ...filled(),
      mailingSameAsResidential: false,
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues.some((i) => i.path[0] === 'mailingAddress')).toBe(true)
  })

  test('requires ICBC details only when ICBC is selected', () => {
    const empty = { driversLicenseNumber: '', heightCm: '', weightKg: '', securityKeyword: '' }
    const withIcbc = addressChangeFormSchema.safeParse({ ...filled(), icbc: empty })
    expect(withIcbc.error?.issues.map((i) => i.path.join('.'))).toEqual([
      'icbc.driversLicenseNumber',
      'icbc.heightCm',
      'icbc.weightKg',
      'icbc.securityKeyword',
    ])
    const withoutIcbc = addressChangeFormSchema.safeParse({
      ...filled(),
      notifyIcbc: false,
      icbc: empty,
    })
    expect(withoutIcbc.success).toBe(true)
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

  test('always disables MSP and sends ICBC details only when ICBC is selected', () => {
    const withIcbc = toAddressChangeRequest(filled(), user, 'k')
    expect(withIcbc.notificationIntent).toEqual({
      notifyBcsc: true,
      notifyIcbc: true,
      notifyMsp: false,
    })
    expect(withIcbc.person).toMatchObject({
      driversLicenseNumber: '1234567',
      heightCm: 175,
      weightKg: 70,
      securityKeyword: 'k',
    })
    const without = toAddressChangeRequest({ ...filled(), notifyIcbc: false }, user, 'k')
    expect(without.notificationIntent.notifyIcbc).toBe(false)
    expect(without.person).not.toHaveProperty('driversLicenseNumber')
  })
})
