import { CSV_BOM, csvLine, type CsvValue } from '@/lib/csv-safe'

/** CSV for HR reports (pure). Cells from lib/csv-safe: formula-safe, quoted when they hold a quote, comma or newline. */

export type CsvCell = CsvValue

export function toCsv(header: readonly string[], rows: readonly (readonly CsvCell[])[]): string {
  return [header, ...rows].map((row) => csvLine(row)).join('\r\n')
}

/** Rupees with two decimals, no symbol or grouping (spreadsheet-friendly). */
export const rupees = (paise: number | null | undefined): string => (paise == null ? '' : (Math.round(paise) / 100).toFixed(2))

export function csvResponse(csv: string, filename: string): Response {
  return new Response(`${CSV_BOM}${csv}`, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${filename.replace(/[^a-zA-Z0-9._-]+/g, '_')}"`,
      'cache-control': 'no-store',
    },
  })
}
