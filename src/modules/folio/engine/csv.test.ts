import { describe, expect, it } from 'vitest'
import { csvCell, csvMoney, csvRow, toCsv, toTitledCsv } from './csv'

describe('csvCell', () => {
  it('quotes every value', () => {
    expect(csvCell('Aarav Retail')).toBe('"Aarav Retail"')
  })
  it('doubles internal quotes', () => {
    expect(csvCell('He said "pay"')).toBe('"He said ""pay"""')
  })
  it('renders null and undefined as empty', () => {
    expect(csvCell(null)).toBe('""')
    expect(csvCell(undefined)).toBe('""')
  })
  it('keeps newlines inside the quotes', () => {
    expect(csvCell('line 1\nline 2')).toBe('"line 1\nline 2"')
  })
  it('keeps zero', () => {
    expect(csvCell(0)).toBe('"0"')
  })
  it('prefixes text that a spreadsheet would run as a formula', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"')
    expect(csvCell('+91 98765')).toBe('"\'+91 98765"')
    expect(csvCell('-2+3')).toBe('"\'-2+3"')
    expect(csvCell('@SUM(A1)')).toBe('"\'@SUM(A1)"')
    expect(csvCell('\tcmd')).toBe('"\'\tcmd"')
  })
  it('does not prefix negative numbers passed as numbers', () => {
    expect(csvCell(-1250.5)).toBe('"-1250.5"')
  })
})

describe('csvRow and toCsv', () => {
  it('joins cells with commas', () => {
    expect(csvRow(['a', 1, null])).toBe('"a","1",""')
  })
  it('starts with a BOM and uses CRLF', () => {
    const csv = toCsv(['A', 'B'], [['1', '2'], ['3', '4']])
    expect(csv.startsWith('﻿')).toBe(true)
    expect(csv.slice(1).split('\r\n')).toEqual(['"A","B"', '"1","2"', '"3","4"'])
  })
  it('produces a header-only file for no rows', () => {
    expect(toCsv(['A'], []).slice(1)).toBe('"A"')
  })
})

describe('toTitledCsv', () => {
  it('writes the preamble, a blank row, then the table', () => {
    const csv = toTitledCsv({ title: 'Aging, receivables', issuer: 'Vistaar WebX — a brand of Sanskaar Webx Services LLP', period: 'As at 1 Oct 2026', generatedOn: '1 Oct 2026' }, ['Client'], [['Aarav']])
    expect(csv.startsWith('﻿')).toBe(true)
    expect(csv.slice(1).split('\r\n')).toEqual([
      '"Aging, receivables"',
      '"Vistaar WebX — a brand of Sanskaar Webx Services LLP"',
      '"As at 1 Oct 2026"',
      '"Generated 1 Oct 2026"',
      '',
      '"Client"',
      '"Aarav"',
    ])
  })
  it('skips a missing period line', () => {
    const lines = toTitledCsv({ title: 'T', generatedOn: '1 Oct 2026' }, ['A'], []).slice(1).split('\r\n')
    expect(lines).toEqual(['"T"', '"Generated 1 Oct 2026"', '', '"A"'])
  })
})

describe('csvMoney', () => {
  it('prints rupees with two decimals as a number', () => {
    expect(csvMoney(12_345_67)).toBe(12345.67)
    expect(csvMoney(-50_00)).toBe(-50)
  })
})
