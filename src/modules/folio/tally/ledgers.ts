/**
 * Flowbit accounts → Tally ledger names (Folio settings → Tally). Pure and client-safe.
 * Tax ledgers take a pattern where `{rate}` becomes the rate, e.g. "Output CGST {rate}%" → "Output CGST 9%".
 */

export const TALLY_LEDGER_KEYS = [
  'sales',
  'outputCgst',
  'outputSgst',
  'outputIgst',
  'roundOff',
  'bank',
  'cash',
  'tdsReceivable',
  'inputCgst',
  'inputSgst',
  'inputIgst',
  'writeOff',
  'debtorsGroup',
] as const
export type TallyLedgerKey = (typeof TALLY_LEDGER_KEYS)[number]
export type TallyLedgers = Record<TallyLedgerKey, string>

export const DEFAULT_TALLY_LEDGERS: TallyLedgers = {
  sales: 'Sales',
  outputCgst: 'Output CGST {rate}%',
  outputSgst: 'Output SGST {rate}%',
  outputIgst: 'Output IGST {rate}%',
  roundOff: 'Round Off',
  bank: 'Bank Account',
  cash: 'Cash',
  tdsReceivable: 'TDS Receivable',
  inputCgst: 'Input CGST',
  inputSgst: 'Input SGST',
  inputIgst: 'Input IGST',
  writeOff: 'Bad Debts Written Off',
  debtorsGroup: 'Sundry Debtors',
}

export const TALLY_LEDGER_LABELS: Record<TallyLedgerKey, { label: string; help?: string }> = {
  sales: { label: 'Sales (income)', help: 'Taxable value of invoices and credit notes' },
  outputCgst: { label: 'Output CGST', help: '{rate} becomes the CGST rate, e.g. 9' },
  outputSgst: { label: 'Output SGST', help: '{rate} becomes the SGST rate' },
  outputIgst: { label: 'Output IGST', help: '{rate} becomes the IGST rate, e.g. 18' },
  roundOff: { label: 'Round off' },
  bank: { label: 'Bank', help: 'Receipts and expenses paid from the bank' },
  cash: { label: 'Cash' },
  tdsReceivable: { label: 'TDS receivable', help: 'TDS your clients withheld' },
  inputCgst: { label: 'Input CGST', help: 'Claimable GST on expenses' },
  inputSgst: { label: 'Input SGST' },
  inputIgst: { label: 'Input IGST' },
  writeOff: { label: 'Write-offs', help: 'Invoice balances written off as bad debt' },
  debtorsGroup: { label: 'Group for client ledgers', help: 'Parent group of party ledgers in the masters' },
}

const MAX_NAME = 100

/** Stored names with blanks (or junk) replaced by the defaults. */
export function resolveTallyLedgers(stored: Partial<Record<string, unknown>> | null | undefined): TallyLedgers {
  const pick = (key: TallyLedgerKey) => {
    const value = stored?.[key]
    return typeof value === 'string' && value.trim() ? value.trim().slice(0, MAX_NAME) : DEFAULT_TALLY_LEDGERS[key]
  }
  return Object.fromEntries(TALLY_LEDGER_KEYS.map((k) => [k, pick(k)])) as TallyLedgers
}

/** "Output CGST {rate}%" at 9 → "Output CGST 9%"; a name without {rate} is used as is. */
export const taxLedgerName = (pattern: string, rate: number) => pattern.replace(/\{rate\}/g, String(Math.round(rate * 100) / 100))
