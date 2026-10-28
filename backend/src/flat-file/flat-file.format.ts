import type {
  AddressChangeRequest,
  RequestPerson,
  SubmittedAddress,
} from '../../generated/prisma/client.js'

export const LINE_ENDING = '\r\n'
const FILE_TIME_ZONE = 'America/Vancouver'

export type FlatFileRecord = {
  request: Pick<AddressChangeRequest, 'receivedAt' | 'effectiveDate'>
  person: Omit<RequestPerson, 'requestId' | 'createdAt' | 'createdBy' | 'updatedAt' | 'updatedBy'>
  address: Omit<
    SubmittedAddress,
    'submittedAddressId' | 'requestId' | 'createdAt' | 'createdBy' | 'updatedAt' | 'updatedBy'
  >
}

type Column = {
  key: string
  // Fixed-length fields keep their slot even when every value is blank.
  minWidth?: number
  value: (record: FlatFileRecord) => string
}

const text = (value: string | null | undefined): string => value ?? ''
const flag = (value: boolean): string => (value ? 'Y' : 'N')
const num = (value: { toString(): string } | null): string =>
  value === null ? '' : value.toString()

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10).replaceAll('-', '')
}

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
    timestampFormat.formatToParts(value).map((p) => [p.type, p.value]),
  )
  return `${parts.year}${parts.month}${parts.day}${parts.hour}${parts.minute}${parts.second}`
}

export function fileStamp(now: Date): { date: string; time: string } {
  const value = timestamp(now)
  return { date: value.slice(0, 8), time: value.slice(8) }
}

type AddressPrefix = 'old' | 'new' | 'mailing'

function addressColumns(prefix: AddressPrefix): Column[] {
  const field = (name: string) => `${prefix}${name}` as keyof FlatFileRecord['address']
  const read = (name: string) => (r: FlatFileRecord) =>
    text(r.address[field(name)] as string | null)
  return [
    { key: `${prefix}_address_line_one`, value: read('AddressLineOne') },
    { key: `${prefix}_address_line_two`, value: read('AddressLineTwo') },
    { key: `${prefix}_city`, value: read('City') },
    { key: `${prefix}_province`, minWidth: 2, value: read('Province') },
    { key: `${prefix}_postal_code`, minWidth: 6, value: read('PostalCode') },
    { key: `${prefix}_country`, value: read('Country') },
  ]
}

// Single source of the file layout; add or remove entries here when form fields change.
export const COLUMNS: readonly Column[] = [
  { key: 'received_at', minWidth: 14, value: (r) => timestamp(r.request.receivedAt) },
  { key: 'effective_date', minWidth: 8, value: (r) => dateOnly(r.request.effectiveDate) },
  { key: 'last_name', value: (r) => r.person.lastName },
  { key: 'first_name', value: (r) => r.person.firstName },
  { key: 'first_middle_initial', minWidth: 1, value: (r) => text(r.person.firstMiddleInitial) },
  { key: 'second_middle_initial', minWidth: 1, value: (r) => text(r.person.secondMiddleInitial) },
  { key: 'date_of_birth', minWidth: 8, value: (r) => dateOnly(r.person.dateOfBirth) },
  // Encrypted at rest and not yet decryptable; blank placeholders until key handling exists.
  { key: 'drivers_license_number', minWidth: 8, value: () => '' },
  { key: 'phn', minWidth: 10, value: () => '' },
  { key: 'security_keyword', value: () => '' },
  { key: 'height_cm', value: (r) => num(r.person.heightCm) },
  { key: 'weight_kg', value: (r) => num(r.person.weightKg) },
  { key: 'daytime_phone', value: (r) => text(r.person.daytimePhone) },
  { key: 'email_address', value: (r) => text(r.person.emailAddress) },
  ...addressColumns('old'),
  ...addressColumns('new'),
  {
    key: 'is_mailing_address_same',
    minWidth: 1,
    value: (r) => flag(r.address.isMailingAddressSame),
  },
  ...addressColumns('mailing'),
]

// Counts code points so multi-byte UTF-8 characters occupy one column position.
const charLength = (value: string): number => [...value].length

export function formatFlatFile(
  records: readonly FlatFileRecord[],
  columns: readonly Column[] = COLUMNS,
): string {
  const rows = records.map((record) =>
    columns.map((column) => column.value(record).replace(/[\r\n]+/g, ' ')),
  )
  const widths = columns.map((column, index) =>
    Math.max(column.minWidth ?? 0, ...rows.map((row) => charLength(row[index] ?? ''))),
  )
  return rows
    .map((row) =>
      row
        .map((value, index) => value + ' '.repeat((widths[index] ?? 0) - charLength(value)))
        .join(' '),
    )
    .map((line) => line + LINE_ENDING)
    .join('')
}

// Partner-specific layouts can be returned here later.
export function formatterFor(_partnerCode: string): (records: readonly FlatFileRecord[]) => string {
  return (records) => formatFlatFile(records)
}
