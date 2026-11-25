export const LINE_ENDING = '\r\n'
const FILE_TIME_ZONE = 'America/Vancouver'

export type FlatFileSourceRow = Record<string, unknown> & { request_id: string }

export type FlatFileColumn = {
  position: number
  fieldKey: string
  columnName: string
  enabled: boolean
  minWidth: number
  fixedWidth?: number | null
  format: string | null
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

function renderDate(value: Date, format: string): string {
  if (format === 'YYYYMMDD') return value.toISOString().slice(0, 10).replaceAll('-', '')
  if (format === 'YYYYMMDD_VANCOUVER') {
    const parts = Object.fromEntries(
      timestampFormat.formatToParts(value).map((part) => [part.type, part.value]),
    )
    return `${parts.year}${parts.month}${parts.day}`
  }
  if (format === 'HHmmss') {
    const parts = Object.fromEntries(
      timestampFormat.formatToParts(value).map((part) => [part.type, part.value]),
    )
    return `${parts.hour}${parts.minute}${parts.second}`
  }
  if (format === 'YYYYMMDDHHmmss') {
    const parts = Object.fromEntries(
      timestampFormat.formatToParts(value).map((part) => [part.type, part.value]),
    )
    return `${parts.year}${parts.month}${parts.day}${parts.hour}${parts.minute}${parts.second}`
  }
  throw new Error(`Unsupported flat-file date format: ${format}`)
}

function renderValue(value: unknown, format: string | null): string {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return format ? renderDate(value, format) : value.toISOString()
  if (typeof value === 'boolean') return value ? 'Y' : 'N'
  if (typeof value === 'string') {
    if (!format) return value
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) throw new Error(`Value does not support format ${format}`)
    return renderDate(date, format)
  }
  if (typeof value === 'number' || typeof value === 'bigint') return String(value)
  if (typeof value === 'object' && 'toString' in value) return value.toString()
  throw new Error(`Unsupported flat-file value type: ${typeof value}`)
}

const charLength = (value: string): number => [...value].length

export class FlatFileFieldTooLongError extends Error {
  constructor(fieldKey: string, columnName: string, length: number, width: number) {
    super(
      `Flat-file field "${columnName}" (${fieldKey}) has ${length} characters; maximum is ${width}`,
    )
    this.name = 'FlatFileFieldTooLongError'
  }
}

export class FlatFileRecordEncodingError extends Error {
  constructor(requestId: string) {
    super(`Request ${requestId} contains characters that cannot be represented in US-ASCII`)
    this.name = 'FlatFileRecordEncodingError'
  }
}

export function assertFlatFileRecordEncoding(
  record: FlatFileSourceRow,
  line: string,
  encoding: string,
): void {
  if (encoding === 'US-ASCII' && [...line].some((character) => character.codePointAt(0)! > 0x7f)) {
    throw new FlatFileRecordEncodingError(record.request_id)
  }
}

function renderFixedRow(values: readonly string[], columns: readonly FlatFileColumn[]): string {
  return (
    values
      .map((value, index) => {
        const column = columns[index]!
        const width = column.fixedWidth!
        const length = charLength(value)
        if (length > width) {
          throw new FlatFileFieldTooLongError(column.fieldKey, column.columnName, length, width)
        }
        return value + ' '.repeat(width - length)
      })
      .join('') + LINE_ENDING
  )
}

export function formatFlatFileRecord(
  record: FlatFileSourceRow,
  columns: readonly FlatFileColumn[],
): string {
  const enabled = columns.filter((column) => column.enabled).sort((a, b) => a.position - b.position)
  if (enabled.length === 0) throw new Error('Partner flat-file layout has no enabled columns')
  if (!enabled.every((column) => column.fixedWidth !== null && column.fixedWidth !== undefined)) {
    throw new Error('Per-record flat-file formatting requires fixed-width columns')
  }
  for (const column of enabled) {
    if (!(column.fieldKey in record)) {
      throw new Error(`Flat-file field "${column.fieldKey}" is not exposed by flat_file_source`)
    }
  }
  const values = enabled.map((column) =>
    renderValue(record[column.fieldKey], column.format).replace(/[\r\n]+/g, ' '),
  )
  return renderFixedRow(values, enabled)
}

export function formatFlatFileHeader(columns: readonly FlatFileColumn[]): string {
  const enabled = columns.filter((column) => column.enabled).sort((a, b) => a.position - b.position)
  if (!enabled.every((column) => column.fixedWidth !== null && column.fixedWidth !== undefined)) {
    throw new Error('Fixed-width flat-file header requires fixed-width columns')
  }
  return renderFixedRow(
    enabled.map((column) => column.columnName),
    enabled,
  )
}

export function formatFlatFile(
  records: readonly FlatFileSourceRow[],
  columns: readonly FlatFileColumn[],
  includeHeader: boolean,
): string {
  const enabled = columns.filter((column) => column.enabled).sort((a, b) => a.position - b.position)
  if (enabled.length === 0) throw new Error('Partner flat-file layout has no enabled columns')

  const allKeys = new Set(records.flatMap((record) => Object.keys(record)))
  for (const column of enabled) {
    if (!allKeys.has(column.fieldKey)) {
      throw new Error(`Flat-file field "${column.fieldKey}" is not exposed by flat_file_source`)
    }
  }

  const rows = records.map((record) =>
    enabled.map((column) =>
      renderValue(record[column.fieldKey], column.format).replace(/[\r\n]+/g, ' '),
    ),
  )
  const fixedWidth = enabled.every(
    (column) => column.fixedWidth !== null && column.fixedWidth !== undefined,
  )
  if (fixedWidth) {
    const header = includeHeader ? formatFlatFileHeader(enabled) : ''
    return header + rows.map((row) => renderFixedRow(row, enabled)).join('')
  }
  const widths = enabled.map((column, index) =>
    Math.max(
      column.minWidth,
      includeHeader ? charLength(column.columnName) : 0,
      ...rows.map((row) => charLength(row[index] ?? '')),
    ),
  )
  const renderRow = (values: readonly string[]) =>
    values
      .map((value, index) => value + ' '.repeat((widths[index] ?? 0) - charLength(value)))
      .join(' ') + LINE_ENDING

  const header = includeHeader ? renderRow(enabled.map((column) => column.columnName)) : ''
  return header + rows.map(renderRow).join('')
}

export function encodeFlatFileContent(content: string, encoding: string): Buffer {
  if (encoding === 'UTF-8') return Buffer.from(content, 'utf8')
  if (encoding === 'US-ASCII') {
    if ([...content].some((character) => character.codePointAt(0)! > 0x7f)) {
      throw new Error('Flat file contains characters that cannot be represented in US-ASCII')
    }
    return Buffer.from(content, 'ascii')
  }
  throw new Error(`Unsupported flat-file encoding: ${encoding}`)
}

export function fileStamp(now: Date): { date: string; time: string } {
  const parts = Object.fromEntries(
    timestampFormat.formatToParts(now).map((part) => [part.type, part.value]),
  )
  const value = `${parts.year}${parts.month}${parts.day}${parts.hour}${parts.minute}${parts.second}`
  return { date: value.slice(0, 8), time: value.slice(8) }
}

export function flatFileName(partnerName: string, now: Date, sequence = 1): string {
  const slug = partnerName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  const { date } = fileStamp(now)
  return `acbc_requests_${slug}_${date.slice(0, 4)}_${date.slice(4, 6)}_${date.slice(6)}_${String(sequence).padStart(2, '0')}.txt`
}
