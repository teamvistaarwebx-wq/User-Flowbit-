import Papa from 'papaparse'
import { readXlsx } from '@/lib/xlsx-read'
import { normaliseHeader, type CsvRow } from '@/modules/muster/import/csv'

/**
 * An uploaded import file (CSV or XLSX) as a header row plus data rows of
 * text. Server-only for XLSX (node:zlib); pure otherwise.
 */

export type Sheet = { headers: string[]; cells: string[][] }

/** 3 MB: thousands of rows, well under the server action body limit. */
export const MAX_IMPORT_BYTES = 3 * 1024 * 1024

export function sheetFromCsv(text: string): Sheet | { error: string } {
  const parsed = Papa.parse<string[]>(text.replace(/^﻿/, ''), { skipEmptyLines: 'greedy' })
  const fatal = parsed.errors.find((e) => e.type === 'Quotes')
  if (fatal) return { error: `Line ${(fatal.row ?? 0) + 1} has an unclosed quote.` }
  const [headers = [], ...cells] = parsed.data
  return { headers: headers.map((h) => h.trim()), cells: cells.map((row) => row.map((c) => (c ?? '').trim())) }
}

/** Reads the upload by its extension. Errors are sentences for the person importing. */
export function readSheet(fileName: string, bytes: Buffer): Sheet | { error: string } {
  if (!bytes.length) return { error: 'The file is empty. Download the template and fill in one row per record.' }
  if (bytes.length > MAX_IMPORT_BYTES) return { error: 'That file is larger than 3 MB. Split it into smaller files.' }
  const name = fileName.toLowerCase()
  if (name.endsWith('.xlsx')) {
    try {
      const rows = readXlsx(bytes)
      const [headers = [], ...cells] = rows
      return { headers: headers.map((h) => h.trim()), cells }
    } catch (error) {
      console.warn('[imports] unreadable xlsx', error)
      return { error: 'That Excel file could not be read. Save it again as .xlsx or .csv and retry.' }
    }
  }
  if (name.endsWith('.csv') || name.endsWith('.txt')) return sheetFromCsv(bytes.toString('utf8'))
  return { error: 'Upload a .csv or .xlsx file.' }
}

/** Data rows keyed by normalised header ("Work Email" -> work_email), with file line numbers (header = 1). */
export function sheetRows(sheet: Sheet): { headers: string[]; rows: CsvRow[] } {
  const headers = sheet.headers.map(normaliseHeader)
  const rows = sheet.cells
    .map((cells, i) => ({ line: i + 2, values: Object.fromEntries(headers.map((h, c) => [h, (cells[c] ?? '').trim()])) }))
    .filter((r) => Object.values(r.values).some(Boolean))
  return { headers, rows }
}
