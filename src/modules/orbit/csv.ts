import { CSV_BOM, csvCell as sharedCsvCell, csvLine, type CsvValue } from '@/lib/csv-safe'

/** CSV writing (RFC 4180) with a UTF-8 BOM so Excel reads ₹ and Indian names correctly. Pure; cells from lib/csv-safe. */

const asCsvValue = (value: unknown): CsvValue => (value === null || value === undefined || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? value : String(value))

export const csvCell = (value: unknown): string => sharedCsvCell(asCsvValue(value))

export function toCsv(headers: string[], rows: unknown[][]): string {
  return `${CSV_BOM}${[headers, ...rows].map((r) => csvLine(r.map(asCsvValue))).join('\r\n')}\r\n`
}

export function csvResponse(csv: string, filename: string): Response {
  return new Response(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${filename}"`, 'Cache-Control': 'no-store' } })
}
