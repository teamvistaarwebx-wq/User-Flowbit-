/**
 * CSV cells for every export (pure). One writer, so the rules never drift
 * (R2 20.3, R3 L-23f):
 * - Formula guard: text that starts with = + - @ (or a tab / carriage return)
 *   would run as a formula in Excel or Sheets, so it gets a leading apostrophe.
 *   Plain numbers like -42.5 stay as they are, typed or as text.
 * - RFC 4180 quoting: a cell with a quote, comma or line break is quoted.
 */
const FORMULA_START = /^[=+\-@\t\r]/
const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/
const NEEDS_QUOTES = /[",\r\n]/

/** UTF-8 byte order mark, so Excel reads ₹ and Indian names correctly. */
export const CSV_BOM = '﻿'

export const formulaSafe = (text: string): string => (FORMULA_START.test(text) && !PLAIN_NUMBER.test(text) ? `'${text}` : text)

export type CsvValue = string | number | boolean | null | undefined

/** One cell. `quote: 'always'` quotes every cell (Folio's reports), otherwise only when needed. */
export function csvCell(value: CsvValue, opts: { quote?: 'needed' | 'always' } = {}): string {
  const text = value === null || value === undefined ? '' : typeof value === 'string' ? formulaSafe(value) : String(value)
  return opts.quote === 'always' || NEEDS_QUOTES.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** One CRLF-free row of cells. */
export const csvLine = (values: readonly CsvValue[], opts: { quote?: 'needed' | 'always' } = {}): string => values.map((v) => csvCell(v, opts)).join(',')

/** Papa's escapeFormulae with the same plain-number exemption as formulaSafe. */
const PAPA_FORMULA = /^(?!-?\d+(\.\d+)?$)[=+\-@\t\r]/

/** Option for every Papa.unparse call that writes user-entered text. */
export const PAPA_SAFE = { escapeFormulae: PAPA_FORMULA } as const
