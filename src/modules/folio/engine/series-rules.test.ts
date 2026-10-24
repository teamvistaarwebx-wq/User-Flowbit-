import { describe, expect, test } from 'vitest'
import { defaultSeries } from '../counter'
import { formatDocumentNumber } from './numbering'
import { seriesLengthProblems } from './series-rules'

const series = (over: Partial<Parameters<typeof seriesLengthProblems>[0]> = {}) => ({
  invoicePrefix: 'VWX', creditNotePrefix: 'VWXCN', receiptPrefix: 'VWXRC', quotePrefix: 'VWX-QUOTE', proformaPrefix: 'VWX-PROFORMA', padding: 4, fyFormat: 'short', ...over,
})

describe('seriesLengthProblems', () => {
  test('passes a series whose GST numbers fit 16 characters', () => {
    expect(seriesLengthProblems(series())).toEqual([])
  })

  test('flags the old default credit-note prefix with the long year', () => {
    // Arrange
    const old = series({ creditNotePrefix: 'VWX-CN', fyFormat: undefined })
    // Act
    const problems = seriesLengthProblems(old)
    // Assert
    expect(problems.map((p) => p.field)).toContain('creditNotePrefix')
    expect(problems[0].message).toMatch(/at most 3 characters/)
  })

  test('ignores quote and proforma prefixes, which are not GST documents', () => {
    expect(seriesLengthProblems(series({ quotePrefix: 'ABCDEFGHIJKL' }))).toEqual([])
  })

  test('suggests fewer digits when no prefix can fit', () => {
    const [problem] = seriesLengthProblems(series({ invoicePrefix: 'ABCDEFGHIJ', padding: 6, fyFormat: 'long' }))
    expect(problem.message).toMatch(/fewer digits or the short year/)
  })
})

describe('defaultSeries', () => {
  test('fits every GST series for a 10-character entity code', () => {
    // Arrange
    const s = defaultSeries('ACMEINDIA1')
    // Act
    const numbers = [s.invoicePrefix, s.creditNotePrefix, s.receiptPrefix].map((p) => formatDocumentNumber(p, '2026-27', 9999, s.padding, s.fyFormat))
    // Assert
    expect(seriesLengthProblems(s)).toEqual([])
    expect(numbers.every((n) => n.length <= 16)).toBe(true)
    expect(s.creditNotePrefix).toBe('ACMCN')
  })

  test('keeps a short code whole', () => {
    expect(defaultSeries('VWX')).toMatchObject({ invoicePrefix: 'VWX', creditNotePrefix: 'VWXCN', fyFormat: 'short' })
  })
})
