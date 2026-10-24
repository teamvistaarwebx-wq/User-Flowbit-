import { CSV_BOM as BOM, csvCell as sharedCsvCell, type CsvValue } from '@/lib/csv-safe'

/**
 * RFC 4180 CSV with a BOM (folio.md 6.18, port of lib/reports/csv.ts) plus a
 * formula-injection guard. Pure.
 */

export type { CsvValue }

const ALWAYS = { quote: 'always' } as const

/** One quoted cell (lib/csv-safe). Text a spreadsheet would run as a formula gets a leading '; a negative amount stays a number. */
export const csvCell = (value: CsvValue): string => (value === null || value === undefined ? '""' : sharedCsvCell(value, ALWAYS))

export const csvRow = (values: readonly CsvValue[]): string => values.map((v) => csvCell(v)).join(',')

export function toCsv(headers: readonly string[], rows: readonly (readonly CsvValue[])[]): string {
  return BOM + [csvRow(headers), ...rows.map(csvRow)].join('\r\n')
}

export type CsvPreamble = { title: string; issuer?: string | null; period?: string | null; generatedOn: string }

/** CSV with a title block: title, issuer, period, "Generated {date}", then a blank row. */
export function toTitledCsv(preamble: CsvPreamble, headers: readonly string[], rows: readonly (readonly CsvValue[])[]): string {
  const lines = [preamble.title, preamble.issuer, preamble.period, `Generated ${preamble.generatedOn}`].filter((l): l is string => Boolean(l))
  return BOM + [...lines.map((l) => csvRow([l])), '', csvRow(headers), ...rows.map(csvRow)].join('\r\n')
}

/** Money column: rupees with 2 decimals, as a plain number (never a formula). */
export const csvMoney = (paise: number): number => Number((paise / 100).toFixed(2))

export function csvResponse(body: string, filename: string): Response {
  return new Response(body, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${filename.replace(/[^\w.-]+/g, '-')}"`,
      'cache-control': 'private, no-store',
    },
  })
}
