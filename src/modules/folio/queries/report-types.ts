import { formatDate } from '@/lib/dates'
import { csvMoney, toTitledCsv, type CsvPreamble, type CsvValue } from '@/modules/folio/engine/csv'
import { isIsoDate } from '@/modules/folio/engine/calendar'
import { financialYearOf, financialYearRange } from '@/modules/folio/engine/numbering'

/**
 * One table shape for every Folio report, so the page and the CSV export
 * render the same rows. Money cells are paise; dates are 'YYYY-MM-DD'.
 */

export const REPORT_KEYS = ['gst', 'sales', 'collections', 'aging', 'revenue'] as const
export type ReportKey = (typeof REPORT_KEYS)[number]
export const REPORT_LABELS: Record<ReportKey, string> = { gst: 'GST', sales: 'Sales register', collections: 'Collections', aging: 'Aging', revenue: 'Revenue' }

export const GST_SECTIONS = ['summary', 'b2b', 'b2cl', 'b2cs', 'exports', 'cdn', 'hsn', 'docs'] as const
export type GstSection = (typeof GST_SECTIONS)[number]
export const GST_SECTION_LABELS: Record<GstSection, string> = {
  summary: 'Summary',
  b2b: 'B2B',
  b2cl: 'B2C large',
  b2cs: 'B2C small',
  exports: 'Exports',
  cdn: 'Credit notes',
  hsn: 'HSN',
  docs: 'Documents',
}

export type ColumnKind = 'text' | 'money' | 'number' | 'date' | 'percent'
export type ReportColumn = { header: string; kind: ColumnKind }
export type ReportCell = string | number | null
export type ReportTable = {
  title: string
  columns: ReportColumn[]
  rows: ReportCell[][]
  totals?: ReportCell[] | null
  empty: string
  note?: string
  /** Period label for the CSV preamble ("1 Apr 2026 to 1 Oct 2026" or "As at 1 Oct 2026"). */
  period: string
  /** Rows whose share crosses a warning line (revenue concentration), by row index. */
  flagged?: number[]
}

export type ReportParams = { from: string; to: string; entityId: string | null; section: GstSection; by: 'client' | 'month' }

export const col = (header: string, kind: ColumnKind = 'text'): ReportColumn => ({ header, kind })

export const periodLabel = (from: string, to: string) => `${formatDate(from)} to ${formatDate(to)}`

const isIso = (v: string | undefined): v is string => Boolean(v && isIsoDate(v))

/** Defaults: from = start of the current FY, to = today. */
export function reportParams(get: (key: string) => string | undefined, today: string): ReportParams {
  const fyStart = financialYearRange(financialYearOf(today)).start
  const from = isIso(get('from')) ? get('from')! : fyStart
  const to = isIso(get('to')) ? get('to')! : today
  const section = (GST_SECTIONS as readonly string[]).includes(get('section') ?? '') ? (get('section') as GstSection) : 'summary'
  return { from: from <= to ? from : to, to, entityId: get('entity') || null, section, by: get('by') === 'month' ? 'month' : 'client' }
}

function csvCellFor(kind: ColumnKind, value: ReportCell): CsvValue {
  if (value === null) return null
  if (kind === 'money' && typeof value === 'number') return csvMoney(value)
  return value
}

export function reportCsv(table: ReportTable, issuer: string | null, generatedOn: string): string {
  const preamble: CsvPreamble = { title: table.title, issuer, period: table.period, generatedOn }
  const rows = [...table.rows, ...(table.totals ? [table.totals] : [])].map((r) => r.map((v, i) => csvCellFor(table.columns[i]?.kind ?? 'text', v)))
  return toTitledCsv(preamble, table.columns.map((c) => c.header), rows)
}

export const sumCol = (rows: ReportCell[][], index: number): number => rows.reduce((s, r) => s + (typeof r[index] === 'number' ? (r[index] as number) : 0), 0)
