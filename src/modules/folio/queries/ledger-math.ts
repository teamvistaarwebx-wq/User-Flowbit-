import { amountInWords, formatINR } from '@/lib/money'

/**
 * The client ledger, derived on read (folio.md 6.15). Pure. Debit raises what
 * the client owes, credit lowers it; a positive closing is owed to us.
 */

export const LEDGER_TYPES = ['opening', 'tax_invoice', 'sale_invoice', 'receipt', 'tds', 'credit_note', 'write_off'] as const
export type LedgerType = (typeof LEDGER_TYPES)[number]

export const LEDGER_TYPE_LABELS: Record<LedgerType, string> = {
  opening: 'Opening',
  tax_invoice: 'Tax invoice',
  sale_invoice: 'Sale invoice',
  receipt: 'Receipt',
  tds: 'TDS',
  credit_note: 'Credit note',
  write_off: 'Write-off',
}

const TYPE_ORDER: Record<LedgerType, number> = { opening: 0, tax_invoice: 1, sale_invoice: 1, receipt: 2, tds: 3, credit_note: 4, write_off: 5 }

export type LedgerRow = {
  date: string
  type: LedgerType
  debitPaise: number
  creditPaise: number
  particulars: string
  document: string
  href: string | null
  sourceId: string
}

export type StatementRow = LedgerRow & { balancePaise: number }

export type Statement = {
  from: string | null
  to: string | null
  broughtForwardPaise: number
  rows: StatementRow[]
  debitPaise: number
  creditPaise: number
  closingPaise: number
}

export function sortLedger(rows: readonly LedgerRow[]): LedgerRow[] {
  return [...rows].sort((a, b) => a.date.localeCompare(b.date) || TYPE_ORDER[a.type] - TYPE_ORDER[b.type] || a.sourceId.localeCompare(b.sourceId))
}

/**
 * Running balance. With a `from` date the balance starts at the brought-forward
 * (everything before `from`), so the last row really is the closing balance.
 */
export function buildStatement(rows: readonly LedgerRow[], range: { from?: string | null; to?: string | null } = {}): Statement {
  const from = range.from || null
  const to = range.to || null
  const sorted = sortLedger(rows)
  const broughtForwardPaise = from ? sorted.filter((r) => r.date < from).reduce((s, r) => s + r.debitPaise - r.creditPaise, 0) : 0
  const inRange = sorted.filter((r) => (!from || r.date >= from) && (!to || r.date <= to))
  let balance = broughtForwardPaise
  const withBalance = inRange.map((r) => {
    balance += r.debitPaise - r.creditPaise
    return { ...r, balancePaise: balance }
  })
  const debitPaise = inRange.reduce((s, r) => s + r.debitPaise, 0)
  const creditPaise = inRange.reduce((s, r) => s + r.creditPaise, 0)
  return { from, to, broughtForwardPaise, rows: withBalance, debitPaise, creditPaise, closingPaise: broughtForwardPaise + debitPaise - creditPaise }
}

export type MonthRow = { month: string; openingPaise: number; billedPaise: number; settledPaise: number; closingPaise: number }

/** Month by month, newest first: opening = previous closing. */
export function monthlyLedger(rows: readonly LedgerRow[]): MonthRow[] {
  const byMonth = new Map<string, { billed: number; settled: number }>()
  for (const r of sortLedger(rows)) {
    const m = r.date.slice(0, 7)
    const cur = byMonth.get(m) ?? { billed: 0, settled: 0 }
    byMonth.set(m, { billed: cur.billed + r.debitPaise, settled: cur.settled + r.creditPaise })
  }
  let opening = 0
  const ascending = [...byMonth.entries()].map(([month, v]) => {
    const row = { month, openingPaise: opening, billedPaise: v.billed, settledPaise: v.settled, closingPaise: opening + v.billed - v.settled }
    opening = row.closingPaise
    return row
  })
  return ascending.reverse()
}

/** "{client} owes ₹X." / credit / square, plus the amount in words. PDFs pass a print formatter ("Rs."). */
export function closingSentence(clientName: string, closingPaise: number, format: (paise: number) => string = formatINR): { sentence: string; words: string } {
  if (closingPaise > 0) return { sentence: `${clientName} owes ${format(closingPaise)}.`, words: amountInWords(closingPaise) }
  if (closingPaise < 0) return { sentence: `We hold ${format(-closingPaise)} of ${clientName}'s money as credit.`, words: amountInWords(-closingPaise) }
  return { sentence: 'The account is square.', words: amountInWords(0) }
}
