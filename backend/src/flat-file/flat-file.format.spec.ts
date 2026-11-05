import {
  LINE_ENDING,
  encodeFlatFileContent,
  fileStamp,
  formatFlatFile,
  type FlatFileColumn,
  type FlatFileSourceRow,
} from './flat-file.format'

const columns: FlatFileColumn[] = [
  {
    position: 1,
    fieldKey: 'submission_timestamp',
    columnName: 'Submission timestamp',
    enabled: true,
    minWidth: 14,
    format: 'YYYYMMDDHHmmss',
  },
  {
    position: 2,
    fieldKey: 'last_name',
    columnName: 'Surname',
    enabled: true,
    minWidth: 0,
    format: null,
  },
  {
    position: 3,
    fieldKey: 'middle_initials',
    columnName: 'Middle initials',
    enabled: true,
    minWidth: 0,
    format: null,
  },
  {
    position: 4,
    fieldKey: 'ignored',
    columnName: 'Ignored',
    enabled: false,
    minWidth: 0,
    format: null,
  },
]

function row(overrides: Partial<FlatFileSourceRow> = {}): FlatFileSourceRow {
  return {
    request_id: 'request-1',
    submission_timestamp: new Date('2025-05-17T02:10:24Z'),
    last_name: 'Svedberg',
    middle_initials: 'C J',
    ignored: 'not output',
    ...overrides,
  }
}

const lines = (content: string) => content.split(LINE_ENDING).slice(0, -1)

describe('formatFlatFile', () => {
  it('uses configured order, omits disabled columns, and emits no header by default', () => {
    const content = formatFlatFile([row()], columns, false)
    expect(lines(content)).toHaveLength(1)
    expect(lines(content)[0]).toContain('20250516191024 Svedberg C J')
    expect(content).not.toContain('Surname')
    expect(content).not.toContain('not output')
  })

  it('includes configured names in a header row when enabled', () => {
    const content = formatFlatFile([row()], columns, true)
    const [header, data] = lines(content)
    expect(header).toContain('Submission timestamp')
    expect(header).toContain('Surname')
    expect(data).toContain('20250516191024')
    expect(data).toContain('Svedberg')
    expect(data).toContain('C J')
  })

  it('pads each column to its longest value and preserves CRLF', () => {
    const content = formatFlatFile(
      [row({ last_name: 'Li' }), row({ last_name: 'Mandira Chengappa' })],
      columns,
      false,
    )
    const [first, second] = lines(content)
    expect(first?.indexOf('C J')).toBe(second?.indexOf('C J'))
    expect(content.endsWith(LINE_ENDING)).toBe(true)
  })

  it('fails clearly when a configured field is not exposed by the view', () => {
    expect(() =>
      formatFlatFile([row()], [{ ...columns[0]!, fieldKey: 'missing_field' }], false),
    ).toThrow('not exposed by flat_file_source')
  })

  it('rejects empty configurations', () => {
    expect(() => formatFlatFile([row()], [], false)).toThrow('no enabled columns')
  })
})

describe('file encoding and timestamps', () => {
  it('rejects non-ASCII characters rather than silently corrupting them', () => {
    expect(() => encodeFlatFileContent('Sḵwx̱wú7mesh', 'US-ASCII')).toThrow('cannot be represented')
    expect(encodeFlatFileContent('ASCII\r\n', 'US-ASCII').toString('ascii')).toBe('ASCII\r\n')
  })

  it('uses Vancouver local date and time for file timestamps', () => {
    expect(fileStamp(new Date('2025-05-17T06:30:00Z'))).toEqual({
      date: '20250516',
      time: '233000',
    })
  })
})
