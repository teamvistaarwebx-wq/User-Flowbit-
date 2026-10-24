import type { CsvRow } from '@/modules/muster/import/csv'
import type { CheckedRow } from '../types'
import { firstSeen, pick, rowResult, rupeesToPaise } from './common'

/** Folio items (the service catalogue): code, name, HSN/SAC, unit, rate and GST rate (pure). */

export const FOLIO_ITEM_COLUMNS = [
  { key: 'code', required: true, example: 'WEB-DEV' },
  { key: 'name', required: true, example: 'Website development' },
  { key: 'description', example: 'Per page, design included' },
  { key: 'hsn_sac', example: '998314' },
  { key: 'unit', example: 'nos' },
  { key: 'rate', example: '25000', help: 'Rupees, before GST.' },
  { key: 'gst_rate', example: '18', help: '0, 0.25, 3, 5, 12, 18 or 28.' },
] as const

export const GST_RATES = [0, 0.25, 3, 5, 12, 18, 28] as const

export type FolioItemRecord = { code: string; name: string; description?: string; hsnSac?: string; unit: string; defaultRatePaise: number; defaultGstRatePercent: number }

export function checkFolioItemRows(rows: readonly CsvRow[], existingCodes: ReadonlySet<string>): CheckedRow<FolioItemRecord>[] {
  const seen = firstSeen()
  return rows.map((row) => {
    const errors: string[] = []
    const code = pick(row, 'code', 'item_code', 'sku').toUpperCase().slice(0, 30)
    const name = pick(row, 'name', 'item', 'item_name').slice(0, 120)
    if (!code) errors.push('Code is missing.')
    else if (existingCodes.has(code)) errors.push(`Item code ${code} is already in use.`)
    const earlier = code ? seen(code, row.line) : null
    if (earlier != null) errors.push(`Item code ${code} is also on line ${earlier}.`)
    if (!name) errors.push('Name is missing.')
    const hsnSac = pick(row, 'hsn_sac', 'hsn', 'sac').replace(/\s/g, '') || undefined
    if (hsnSac && !/^\d{4,8}$/.test(hsnSac)) errors.push(`HSN/SAC "${hsnSac}" should be 4 to 8 digits.`)
    const rate = rupeesToPaise(pick(row, 'rate', 'price', 'amount'))
    if (rate == null) errors.push(`Rate "${pick(row, 'rate', 'price', 'amount')}" is not an amount in rupees.`)
    const gstRaw = pick(row, 'gst_rate', 'gst', 'tax_rate').replace('%', '')
    const gst = gstRaw ? Number(gstRaw) : 18
    if (!(GST_RATES as readonly number[]).includes(gst)) errors.push(`GST rate "${gstRaw}" is not one of ${GST_RATES.join(', ')}.`)
    return rowResult(row.line, name || code, errors, [], { code, name, description: pick(row, 'description').slice(0, 500) || undefined, hsnSac, unit: pick(row, 'unit').slice(0, 20) || 'nos', defaultRatePaise: rate ?? 0, defaultGstRatePercent: gst })
  })
}
