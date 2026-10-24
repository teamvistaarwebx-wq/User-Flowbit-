import Papa from 'papaparse'
import { describe, expect, it } from 'vitest'
import { csvCell, csvLine, formulaSafe, PAPA_SAFE } from '@/lib/csv-safe'
import { csvCell as folioCell } from '@/modules/folio/engine/csv'
import { toCsv as musterReportCsv } from '@/modules/muster/reports/csv'
import { csvCell as orbitCell } from '@/modules/orbit/csv'

describe('formulaSafe', () => {
  it('prefixes text a spreadsheet would run as a formula', () => {
    expect(formulaSafe('=HYPERLINK("https://x","open")')).toBe(`'=HYPERLINK("https://x","open")`)
    expect(formulaSafe('@SUM(A1)')).toBe(`'@SUM(A1)`)
    expect(formulaSafe('+91 98765')).toBe(`'+91 98765`)
  })

  it('leaves plain text and numbers alone', () => {
    expect(formulaSafe('Aditi Singh')).toBe('Aditi Singh')
    expect(formulaSafe('-42.5')).toBe('-42.5')
  })
})

describe('csvCell (one writer for every export)', () => {
  it('quotes only when a cell holds a quote, comma or line break', () => {
    expect(csvCell('Acme')).toBe('Acme')
    expect(csvCell('Acme, Indore')).toBe('"Acme, Indore"')
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
    expect(csvCell(null)).toBe('')
  })

  it('quotes every cell when asked', () => {
    expect(csvLine(['a', 1, null], { quote: 'always' })).toBe('"a","1",""')
  })

  it('guards a leading tab or carriage return as well as = + - @', () => {
    expect(csvCell('\tcmd')).toBe(`'\tcmd`)
    expect(csvCell('\r=1')).toBe(`"'\r=1"`)
  })
})

describe('every CSV writer follows the same rules', () => {
  it('HR reports guard a leading tab (R3 L-23f)', () => {
    expect(musterReportCsv(['Note'], [['\t=cmd']])).toBe(`Note\r\n'\t=cmd`)
  })

  it('Folio keeps a negative amount passed as text a number (R2 20.3)', () => {
    expect(folioCell('-1250.50')).toBe('"-1250.50"')
    expect(folioCell('-2+3')).toBe(`"'-2+3"`)
  })

  it('Orbit and Folio agree on the guarded text', () => {
    expect(orbitCell('=1+1')).toBe(`'=1+1`)
    expect(folioCell('=1+1')).toBe(`"'=1+1"`)
  })

  it('Papa exports guard formulas but leave negative numbers as text alone', () => {
    const csv = Papa.unparse({ fields: ['A', 'B'], data: [['=SUM(1)', '-42.5']] }, PAPA_SAFE)
    expect(csv).toBe(`A,B\r\n"'=SUM(1)",-42.5`)
  })
})
