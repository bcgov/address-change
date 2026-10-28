import {
  COLUMNS,
  LINE_ENDING,
  type FlatFileRecord,
  fileStamp,
  formatFlatFile,
} from './flat-file.format'

const charLength = (value: string) => [...value].length

function record(
  overrides: Partial<FlatFileRecord['person']> = {},
  address: Partial<FlatFileRecord['address']> = {},
) {
  return {
    request: {
      receivedAt: new Date('2025-05-17T02:10:24Z'),
      effectiveDate: new Date('2025-06-01'),
    },
    person: {
      firstName: 'Kathleen',
      firstMiddleInitial: null,
      secondMiddleInitial: null,
      lastName: 'Svedberg',
      dateOfBirth: new Date('1989-03-16'),
      emailAddress: null,
      daytimePhone: null,
      driversLicenseNumberEncrypted: null,
      heightCm: null,
      weightKg: null,
      phnEncrypted: null,
      securityKeywordEncrypted: null,
      ...overrides,
    },
    address: {
      oldAddressLineOne: '7155 Dallas Dr',
      oldAddressLineTwo: null,
      oldCity: 'Kamloops',
      oldProvince: 'BC',
      oldPostalCode: 'V2C4T1',
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
      ...address,
    },
  } as FlatFileRecord
}

const lines = (content: string) => content.split(LINE_ENDING).slice(0, -1)

describe('formatFlatFile', () => {
  it('writes one CRLF-terminated line per record with no header', () => {
    const content = formatFlatFile([record(), record({ lastName: 'Zhang' })])
    expect(lines(content)).toHaveLength(2)
    expect(content.endsWith(LINE_ENDING)).toBe(true)
  })

  it('starts with received_at in Vancouver time and effective_date', () => {
    const [line] = lines(formatFlatFile([record()]))
    expect(line?.startsWith('20250516191024 20250601 ')).toBe(true)
  })

  it('sizes each column to its longest value and separates columns with one space', () => {
    const [first, second] = lines(
      formatFlatFile([record({ lastName: 'Li' }), record({ lastName: 'Mandira Chengappa' })]),
    )
    expect(first).toContain('Li                Kathleen')
    expect(second).toContain('Mandira Chengappa Kathleen')
  })

  it('keeps minimum widths for blank fixed-length columns', () => {
    const [line] = lines(formatFlatFile([record()]))
    const expectedLength =
      COLUMNS.reduce((total, column) => total + (column.minWidth ?? 0), 0) + COLUMNS.length - 1
    expect(charLength(line ?? '')).toBeGreaterThanOrEqual(expectedLength)
    expect(line).toContain('19890316 ' + ' '.repeat(8) + ' ' + ' '.repeat(10))
  })

  it('pads Unicode by characters so every line has the same length', () => {
    const content = formatFlatFile([record({ firstName: 'ᐊᓂᔑᓈᐯ' }), record({ firstName: 'Bo' })])
    const [first, second] = lines(content)
    expect(charLength(first ?? '')).toBe(charLength(second ?? ''))
    expect(first).toContain('ᐊᓂᔑᓈᐯ')
  })

  it('never truncates long values', () => {
    const long = 'x'.repeat(200)
    const [line] = lines(formatFlatFile([record({}, { newAddressLineOne: long })]))
    expect(line).toContain(long)
  })

  it('writes mailing flag as Y/N and decimals as text', () => {
    const [line] = lines(
      formatFlatFile([
        record(
          {
            heightCm: { toString: () => '183' } as never,
            weightKg: { toString: () => '127.3' } as never,
          },
          { isMailingAddressSame: false, mailingAddressLineOne: 'PO Box 3115' },
        ),
      ]),
    )
    expect(line).toContain('183 127.3')
    expect(line).toContain(' N PO Box 3115')
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
