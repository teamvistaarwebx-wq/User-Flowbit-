import type { CsvRow } from '@/modules/muster/import/csv'
import type { CheckedRow } from '../types'

/** Small pure helpers the importers share. */

export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export const isRealDay = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d
export const key = (value: string | undefined) => (value ?? '').trim().toLowerCase()

/** Reads a row's value by the first header present (aliases). */
export const pick = (row: CsvRow, ...names: string[]) => names.map((n) => row.values[n]?.trim()).find((v) => v) ?? ''

/** Columns the importer does not know (shown as "ignored" in the preview). */
export const unknownHeaders = (headers: readonly string[], known: readonly string[]) => headers.filter((h) => h && !known.includes(h))

/** Finishes a row: the record only when there are no errors. */
export function rowResult<R>(line: number, label: string, errors: string[], warnings: string[], record: R): CheckedRow<R> {
  return { line, label: label || '—', errors, warnings, record: errors.length ? null : record }
}

/** Remembers values seen earlier in the file: the first line that used each. */
export function firstSeen() {
  const seen = new Map<string, number>()
  return (value: string, line: number): number | null => {
    if (!value) return null
    const earlier = seen.get(value)
    if (earlier != null) return earlier
    seen.set(value, line)
    return null
  }
}

/** Rupees as typed ("1,250.50", "₹ 999") -> paise, or null. */
export function rupeesToPaise(raw: string): number | null {
  const clean = raw.replace(/[₹,\s]/g, '')
  if (!clean) return 0
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null
  return Math.round(Number(clean) * 100)
}
