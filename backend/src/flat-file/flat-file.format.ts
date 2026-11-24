import type {
  AddressChangeRequest,
  RequestPerson,
  SubmittedAddress,
} from '../../generated/prisma/client.js'

export const LINE_ENDING = '\r\n'
const FILE_TIME_ZONE = 'America/Vancouver'

export type FlatFileRecord = {
  request: Pick<AddressChangeRequest, 'requestId' | 'receivedAt' | 'effectiveDate'>
  person: Omit<RequestPerson, 'requestId' | 'createdAt' | 'createdBy' | 'updatedAt' | 'updatedBy'>
  address: Omit<
    SubmittedAddress,
    'submittedAddressId' | 'requestId' | 'createdAt' | 'createdBy' | 'updatedAt' | 'updatedBy'
  >
  secrets?: {
    driversLicenseNumber?: string
    phn?: string
    securityKeyword?: string
  }
}

type PartnerCode = 'ICBC' | 'HEALTH'
type Column = {
  label: string
  width: number
  value: (record: FlatFileRecord) => string
}
type AddressPrefix = 'old' | 'new' | 'mailing'
type PartnerAddress = {
  bypassed: string
  aptNo: string
  streetNo: string
  street: string
  streetType: string
  streetDirection: string
  city: string
  province: string
  postalCode: string
  poBox: string
  postalStation: string
  site: string
  compartment: string
  route: string
  additionalLine1: string
  additionalLine2: string
}

const text = (value: string | null | undefined): string => value ?? ''
const num = (value: { toString(): string } | null): string =>
  value === null ? '' : value.toString()
const timestampFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: FILE_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

function timestamp(value: Date): string {
  const parts = Object.fromEntries(
    timestampFormat.formatToParts(value).map((part) => [part.type, part.value]),
  )
  return `${parts.year}${parts.month}${parts.day}${parts.hour}${parts.minute}${parts.second}`
}

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10).replaceAll('-', '')
}

export function fileStamp(now: Date): { date: string; time: string } {
  const value = timestamp(now)
  return { date: value.slice(0, 8), time: value.slice(8) }
}

const field = (label: string, width: number, value: Column['value']): Column => ({
  label,
  width,
  value,
})

const streetTypes = new Set([
  'alley', 'aly', 'avenue', 'ave', 'bay', 'bend', 'blvd', 'boulevard', 'circle', 'cir',
  'close', 'common', 'court', 'ct', 'crescent', 'cres', 'drive', 'dr', 'gate', 'heights',
  'highway', 'hwy', 'lane', 'ln', 'loop', 'manor', 'parkway', 'pkwy', 'place', 'pl',
  'plaza', 'road', 'rd', 'row', 'square', 'sq', 'street', 'st', 'terrace', 'terr', 'trail',
  'trl', 'way',
])
const directions = new Set(['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'])

function addressParts(record: FlatFileRecord, prefix: AddressPrefix): PartnerAddress {
  const address = record.address
  const sourcePrefix: AddressPrefix =
    prefix === 'mailing' && address.isMailingAddressSame ? 'new' : prefix
  const value = (part: 'AddressLineOne' | 'AddressLineTwo' | 'City' | 'Province' | 'PostalCode') =>
    text(address[`${sourcePrefix}${part}` as keyof FlatFileRecord['address']] as string | null)
  const lineOne = value('AddressLineOne').trim()
  const lineTwo = value('AddressLineTwo').trim()
  const output: PartnerAddress = {
    bypassed: 'N',
    aptNo: '',
    streetNo: '',
    street: '',
    streetType: '',
    streetDirection: '',
    city: value('City'),
    province: value('Province'),
    postalCode: value('PostalCode').replace(/\s+/g, ''),
    poBox: '',
    postalStation: '',
    site: '',
    compartment: '',
    route: '',
    additionalLine1: '',
    additionalLine2: '',
  }

  const poBox = /^(?:P\.?\s*O\.?\s*)?BOX\s+(.+)$/i
  const boxMatch = lineOne.match(poBox) ?? lineTwo.match(poBox)
  if (boxMatch) {
    output.poBox = boxMatch[1] ?? ''
    if (lineOne.match(poBox)) output.additionalLine1 = lineTwo
    else output.additionalLine1 = lineOne
    return output
  }

  const unitMatch = lineTwo.match(/^(?:APT(?:ARTMENT)?|UNIT|SUITE|STE|#)\s*([\w-]+)\s*$/i)
  if (unitMatch) output.aptNo = unitMatch[1] ?? ''
  else if (lineTwo) output.additionalLine1 = lineTwo

  const routeMatch = lineOne.match(/^(?:RURAL\s+ROUTE|RR)\s*(\w+)(?:\s+BOX\s+(\w+))?$/i)
  if (routeMatch) {
    output.route = routeMatch[1] ?? ''
    output.poBox = routeMatch[2] ?? ''
    return output
  }

  const siteMatch = lineOne.match(/^SITE\s+(\w+)(?:\s+COMP(?:ARTMENT)?\s+(\w+))?$/i)
  if (siteMatch) {
    output.site = siteMatch[1] ?? ''
    output.compartment = siteMatch[2] ?? ''
    return output
  }

  const streetMatch = lineOne.match(/^(\d+[A-Za-z]?(?:-\d+[A-Za-z]?)?)\s+(.+)$/)
  let street = lineOne
  if (streetMatch) {
    output.streetNo = streetMatch[1] ?? ''
    street = streetMatch[2] ?? ''
  }
  const tokens = street.split(/\s+/).filter(Boolean)
  const last = tokens.at(-1) ?? ''
  if (directions.has(last.toUpperCase())) {
    output.streetDirection = tokens.pop() ?? ''
  }
  const type = tokens.at(-1) ?? ''
  if (streetTypes.has(type.toLowerCase())) {
    output.streetType = tokens.pop() ?? ''
  }
  output.street = tokens.join(' ')
  return output
}

function addressValue(prefix: AddressPrefix, key: keyof PartnerAddress): Column['value'] {
  return (record) => addressParts(record, prefix)[key]
}

function addressColumns(prefix: AddressPrefix): Column[] {
  const f = (name: string, width: number, key: keyof PartnerAddress) =>
    field(`${prefix} ${name}`, width, addressValue(prefix, key))
  const columns = [
    f('Addr Bypassed?', 1, 'bypassed'),
    f('Apt No', 6, 'aptNo'),
    f('St No', 6, 'streetNo'),
    f('Street', 30, 'street'),
    f('St Type', 6, 'streetType'),
    f('St Dir', 2, 'streetDirection'),
    f('City', 35, 'city'),
    f('Prov', 2, 'province'),
    f('Postal Code', 6, 'postalCode'),
    f('PO Box', 6, 'poBox'),
    f('Postal Station', 30, 'postalStation'),
    f('Site', 4, 'site'),
    f('Compartment', 4, 'compartment'),
    f('Route', 8, 'route'),
    f('Additional line 1', 40, 'additionalLine1'),
    f('Additional line 2', 40, 'additionalLine2'),
  ]
  if (prefix === 'mailing') {
    columns.push(f('Additional line 2', 40, 'additionalLine2'))
  }
  return columns
}

function commonIdentityColumns(): Column[] {
  return [
    field('Tran Date', 8, (record) => timestamp(record.request.receivedAt).slice(0, 8)),
    field('Tran Time', 6, (record) => timestamp(record.request.receivedAt).slice(8)),
    field('COA Date', 8, (record) => dateOnly(record.request.effectiveDate)),
  ]
}

function personColumns(): Column[] {
  return [
    field('Last Name', 35, (record) => record.person.lastName),
    field('First Name', 15, (record) => record.person.firstName),
    field('1st Initial', 1, (record) => text(record.person.firstMiddleInitial)),
    field('2nd Initial', 1, (record) => text(record.person.secondMiddleInitial)),
    field('DOB', 8, (record) => dateOnly(record.person.dateOfBirth)),
  ]
}

const icbcColumns: Column[] = [
  ...commonIdentityColumns(),
  field('BCDL', 7, (record) => text(record.secrets?.driversLicenseNumber)),
  ...personColumns().slice(0, 5),
  field('DL Security word', 22, (record) => text(record.secrets?.securityKeyword)),
  field('DL Height', 3, (record) => num(record.person.heightCm)),
  field('DL Weight', 5, (record) => num(record.person.weightKg)),
  ...addressColumns('old'),
  ...addressColumns('new'),
  ...addressColumns('mailing'),
  field('Phone Number', 10, (record) => text(record.person.daytimePhone)),
  field('Email Address', 50, (record) => text(record.person.emailAddress)),
]

const healthColumns: Column[] = [
  ...commonIdentityColumns(),
  field('PHN', 10, (record) => text(record.secrets?.phn)),
  ...personColumns(),
  ...addressColumns('old'),
  ...addressColumns('new'),
  ...addressColumns('mailing'),
  field('Phone Number', 10, (record) => text(record.person.daytimePhone)),
  field('Email Address', 50, (record) => text(record.person.emailAddress)),
]

// Partner specifications have no header row: each record is the concatenation
// of the fixed-width fields in the documented order.
export const PARTNER_LAYOUTS: Readonly<Record<PartnerCode, readonly Column[]>> = {
  ICBC: icbcColumns,
  HEALTH: healthColumns,
}

const charLength = (value: string): number => [...value].length

export class FlatFileFieldTooLongError extends Error {
  constructor(label: string, length: number, width: number) {
    super(`Flat-file field "${label}" has ${length} characters; maximum is ${width}`)
    this.name = 'FlatFileFieldTooLongError'
  }
}

export function formatFlatFileRecord(record: FlatFileRecord, partnerCode: string): string {
  const columns = PARTNER_LAYOUTS[partnerCode as PartnerCode]
  if (!columns) throw new Error(`Unsupported flat-file partner: ${partnerCode}`)

  const cells = columns.map((column) => column.value(record).replace(/[\r\n]+/g, ' '))
  return (
    cells
      .map((value, index) => {
        const column = columns[index]!
        const length = charLength(value)
        if (length > column.width) throw new FlatFileFieldTooLongError(column.label, length, column.width)
        return value + ' '.repeat(column.width - length)
      })
      .join('') + LINE_ENDING
  )
}

export function formatFlatFile(records: readonly FlatFileRecord[], partnerCode: string): string {
  return records
    .map((record) => formatFlatFileRecord(record, partnerCode))
    .join('')
}

export function formatterFor(partnerCode: string): (records: readonly FlatFileRecord[]) => string {
  return (records) => formatFlatFile(records, partnerCode)
}
