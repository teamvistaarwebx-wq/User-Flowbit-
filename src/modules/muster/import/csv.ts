import Papa from 'papaparse'
import { PAPA_SAFE } from '@/lib/csv-safe'

/** CSV parsing with loose header matching and 1-based file line numbers (pure). */

/** "Official Email " → "official_email"; BOM stripped. */
export const normaliseHeader = (h: string) =>
  h
    .replace(/^﻿/, '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '')

export type CsvRow = { line: number; values: Record<string, string> }

export function parseCsv(text: string): { headers: string[]; rows: CsvRow[]; error: string | null } {
  const parsed = Papa.parse<string[]>(text.replace(/^﻿/, ''), { skipEmptyLines: 'greedy' })
  const [head, ...body] = parsed.data
  if (!head?.length) return { headers: [], rows: [], error: 'The file is empty. Download the template and fill in one row per person.' }
  const headers = head.map(normaliseHeader)
  const rows = body.map((cells, i) => ({
    line: i + 2,
    values: Object.fromEntries(headers.map((h, c) => [h, (cells[c] ?? '').trim()])),
  }))
  const fatal = parsed.errors.find((e) => e.type === 'Quotes')
  return { headers, rows, error: fatal ? `Line ${(fatal.row ?? 0) + 1} has an unclosed quote.` : null }
}

export const toCsv = (rows: Record<string, string | number>[], columns: string[]) => Papa.unparse({ fields: columns, data: rows.map((r) => columns.map((c) => r[c] ?? '')) }, PAPA_SAFE)
