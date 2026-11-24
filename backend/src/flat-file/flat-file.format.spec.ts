import {
  LINE_ENDING,
  fileStamp,
  formatFlatFile,
  type FlatFileRecord,
} from './flat-file.format'

const charLength = (value: string) => [...value].length

function record(
  overrides: Partial<FlatFileRecord['person']> = {},
  addressOverrides: Partial<FlatFileRecord['address']> = {},
  secrets: FlatFileRecord['secrets'] = {},
): FlatFileRecord {
  return {
    request: {
      requestId: 'request-1',
      receivedAt: new Date('2025-05-17T02:10:24Z'),
      effectiveDate: new Date('2025-06-01T00:00:00Z'),
    },
    person: {
      firstName: 'Kathleen',
      firstMiddleInitial: 'C',
      secondMiddleInitial: 'J',
      lastName: 'Svedberg',
      dateOfBirth: new Date('1989-03-16T00:00:00Z'),
      emailAddress: 'person@example.com',
      daytimePhone: '2505550101',
      driversLicenseNumberEncrypted: null,
      heightCm: { toString: () => '183' } as never,
      weightKg: { toString: () => '127.3' } as never,
      phnEncrypted: null,
      securityKeywordEncrypted: null,
      ...overrides,
    },
    address: {
      oldAddressLineOne: '7155 Dallas Dr',
      oldAddressLineTwo: 'Unit E20',
      oldCity: 'Kamloops',
      oldProvince: 'BC',
      oldPostalCode: 'V2C 4T1',
      oldCountry: 'CA',
      newAddressLineOne: '1128 Bentley Pl',
      newAddressLineTwo: null,
      newCity: 'Kamloops',
      newProvince: 'BC',
      newPostalCode: 'V2B5M5',
      newCountry: 'CA',
      isMailingAddressSame: true,
      mailingAddressLineOne: null,
      mailingAddressLineTwo: null,
      mailingCity: null,
      mailingProvince: null,
      mailingPostalCode: null,
      mailingCountry: null,
      ...addressOverrides,
    },
    secrets,
  }
}

const lines = (content: string) => content.split(LINE_ENDING).slice(0, -1)

describe('formatFlatFile', () => {
  it('writes the ICBC specification as a 897-character fixed-width record', () => {
    const [line] = lines(
      formatFlatFile(
        [
          record({}, {}, {
            driversLicenseNumber: 'A123456',
            securityKeyword: 'blue heron',
          }),
        ],
        'ICBC',
      ),
    )

    expect(charLength(line ?? '')).toBe(897)
    expect(line?.slice(0, 29)).toBe(['20250516', '191024', '20250601', 'A123456'].join(''))
    expect(line?.slice(29, 89)).toBe(
      ['Svedberg'.padEnd(35), 'Kathleen'.padEnd(15), 'CJ19890316'].join(''),
    )
    expect(line?.slice(89, 119)).toBe(
      ['blue heron'.padEnd(22), '183'.padEnd(3), '127.3'.padEnd(5)].join(''),
    )
    expect(line?.slice(119, 120)).toBe('N')
    expect(line?.slice(120, 126)).toBe('E20'.padEnd(6))
    expect(line?.slice(126, 132)).toBe('7155'.padEnd(6))
    expect(line?.slice(132, 162)).toBe('Dallas'.padEnd(30))
    expect(line?.slice(162, 168)).toBe('Dr'.padEnd(6))
    expect(line?.slice(205, 207)).toBe('BC')
    expect(line?.slice(207, 213)).toBe('V2C4T1')
    expect(line?.slice(-60, -50)).toBe('2505550101')
    expect(line?.slice(-50)).toBe('person@example.com'.padEnd(50))
  })

  it('writes MSP in its specified order and exact 870-character width', () => {
    const [line] = lines(formatFlatFile([record({}, {}, { phn: '1234567890' })], 'HEALTH'))

    expect(charLength(line ?? '')).toBe(870)
    expect(line?.slice(0, 32)).toBe(['20250516', '191024', '20250601', '1234567890'].join(''))
    expect(line?.slice(32, 92)).toBe(
      ['Svedberg'.padEnd(35), 'Kathleen'.padEnd(15), 'CJ19890316'].join(''),
    )
    expect(line?.slice(92, 93)).toBe('N')
    expect(line?.slice(93, 99)).toBe('E20'.padEnd(6))
    expect(line?.slice(-60, -50)).toBe('2505550101')
    expect(line?.slice(-50)).toBe('person@example.com'.padEnd(50))
  })

  it('uses the new address for mailing when the resident selected same-as-new', () => {
    const [line] = lines(formatFlatFile([record()], 'HEALTH'))
    const addressLength = 226
    const newAddressStart = 92 + addressLength
    const mailingAddressStart = newAddressStart + addressLength
    expect(line?.slice(newAddressStart, newAddressStart + addressLength)).toBe(
      line?.slice(mailingAddressStart, mailingAddressStart + addressLength),
    )
  })

  it('ends each record with CRLF and emits no header', () => {
    const content = formatFlatFile([record(), record({ lastName: 'Lee' })], 'ICBC')
    expect(lines(content)).toHaveLength(2)
    expect(content.endsWith(LINE_ENDING)).toBe(true)
    expect(content.startsWith('Tran Date')).toBe(false)
  })

  it('fails rather than shifting fixed columns when a value exceeds its field width', () => {
    expect(() =>
      formatFlatFile([record({ lastName: 'x'.repeat(36) })], 'HEALTH'),
    ).toThrow('Flat-file field "Last Name" has 36 characters; maximum is 35')
  })

  it('rejects unsupported partner layouts', () => {
    expect(() => formatFlatFile([record()], 'BCSC')).toThrow('Unsupported flat-file partner: BCSC')
  })
})

describe('fileStamp', () => {
  it('uses Vancouver local date and time', () => {
    expect(fileStamp(new Date('2025-05-17T06:30:00Z'))).toEqual({
      date: '20250516',
      time: '233000',
    })
  })
})
