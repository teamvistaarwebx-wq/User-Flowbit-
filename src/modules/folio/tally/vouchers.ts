import { taxLedgerName, type TallyLedgers } from './ledgers'

/**
 * Folio documents → double-entry vouchers (pure). An entry's `paise` is positive for a debit and negative
 * for a credit; every voucher sums to zero (any rounding residual goes to the round-off ledger).
 */

export const VOUCHER_TYPES = ['Sales', 'Credit Note', 'Receipt', 'Payment', 'Journal'] as const
export type VoucherType = (typeof VOUCHER_TYPES)[number]

/** A bill reference on a party entry, so Tally's bill-wise outstanding matches (New Ref on the invoice, Agst Ref after). */
export type BillRef = { name: string; type: 'New Ref' | 'Agst Ref' | 'On Account'; paise: number }
export type VoucherEntry = { ledger: string; paise: number; bills?: BillRef[] }
export type Voucher = { type: VoucherType; date: string; number: string; party: string | null; narration: string; entries: VoucherEntry[] }

export type TaxLine = { rate: number; cgstPaise: number; sgstPaise: number; igstPaise: number }
/** `reverseCharge`: the recipient pays the GST, so the supplier posts no output tax and the party owes only the taxable value. */
export type SaleDoc = { number: string; date: string; party: string; narration?: string; totalPaise: number; taxablePaise: number; lines: TaxLine[]; reverseCharge?: boolean; /** Credit notes: the invoice they reduce. */ againstInvoice?: string }
export type ReceiptDoc = { number: string; date: string; party: string; amountPaise: number; tdsPaise: number; cash: boolean; narration?: string; /** Invoice numbers the receipt settles, with cash + TDS applied to each; the rest is an advance. */ settles?: { invoice: string; paise: number }[] }
export type WriteOffDoc = { invoice: string; date: string; party: string; amountPaise: number; reason?: string }
export type ExpenseDoc = { number: string; date: string; category: string; vendor: string; amountPaise: number; gstPaise: number; itc: boolean; interState: boolean; cash: boolean; narration?: string }

/** Sum of a voucher's entries (0 when balanced). */
export const voucherBalance = (v: Pick<Voucher, 'entries'>) => v.entries.reduce((s, e) => s + e.paise, 0)

/** Same ledger merged, zero rows dropped, order kept. */
function tidy(entries: readonly VoucherEntry[]): VoucherEntry[] {
  const order: string[] = []
  const sums = new Map<string, number>()
  const bills = new Map<string, BillRef[]>()
  for (const e of entries) {
    if (!sums.has(e.ledger)) order.push(e.ledger)
    sums.set(e.ledger, (sums.get(e.ledger) ?? 0) + e.paise)
    if (e.bills?.length) bills.set(e.ledger, [...(bills.get(e.ledger) ?? []), ...e.bills])
  }
  return order.map((ledger) => ({ ledger, paise: sums.get(ledger) ?? 0, ...(bills.has(ledger) ? { bills: bills.get(ledger) } : {}) })).filter((e) => e.paise !== 0)
}

/** Closes the voucher on the round-off ledger when the parts do not add up to the total. */
function balanced(entries: readonly VoucherEntry[], roundOff: string): VoucherEntry[] {
  const residual = entries.reduce((s, e) => s + e.paise, 0)
  return tidy(residual ? [...entries, { ledger: roundOff, paise: -residual }] : entries)
}

/** Output tax by ledger: CGST and SGST at half the rate, IGST at the full rate. */
function taxEntries(lines: readonly TaxLine[], l: TallyLedgers): VoucherEntry[] {
  return lines.flatMap((line) => [
    { ledger: taxLedgerName(l.outputCgst, line.rate / 2), paise: line.cgstPaise },
    { ledger: taxLedgerName(l.outputSgst, line.rate / 2), paise: line.sgstPaise },
    { ledger: taxLedgerName(l.outputIgst, line.rate), paise: line.igstPaise },
  ])
}

/** Output tax for a document: none under reverse charge, where the recipient pays the GST to the government. */
const docTax = (doc: SaleDoc, l: TallyLedgers): VoucherEntry[] => (doc.reverseCharge ? [] : taxEntries(doc.lines, l))

/** Reverse-charge tax, named in the narration so the books still show what the recipient pays. */
function rcmNote(doc: SaleDoc): string {
  if (!doc.reverseCharge) return ''
  const tax = doc.lines.reduce((s, x) => s + x.cgstPaise + x.sgstPaise + x.igstPaise, 0)
  return ` (reverse charge: GST ${(tax / 100).toFixed(2)} payable by the recipient)`
}

/** Sales voucher: Dr party (total); Cr sales (taxable), Cr output tax by rate (none under reverse charge); round-off closes it. */
export function salesVoucher(doc: SaleDoc, l: TallyLedgers): Voucher {
  const credits = [{ ledger: l.sales, paise: doc.taxablePaise }, ...docTax(doc, l)].map((e) => ({ ...e, paise: -e.paise }))
  return { type: 'Sales', date: doc.date, number: doc.number, party: doc.party, narration: `${doc.narration ?? `Invoice ${doc.number}`}${rcmNote(doc)}`, entries: balanced([{ ledger: doc.party, paise: doc.totalPaise, bills: [{ name: doc.number, type: 'New Ref', paise: doc.totalPaise }] }, ...credits], l.roundOff) }
}

/** Credit note: the mirror of a sale (Dr sales and output tax, none under reverse charge; Cr party). */
export function creditNoteVoucher(doc: SaleDoc, l: TallyLedgers): Voucher {
  const debits = [{ ledger: l.sales, paise: doc.taxablePaise }, ...docTax(doc, l)]
  return { type: 'Credit Note', date: doc.date, number: doc.number, party: doc.party, narration: `${doc.narration ?? `Credit note ${doc.number}`}${rcmNote(doc)}`, entries: balanced([...debits, { ledger: doc.party, paise: -doc.totalPaise, ...(doc.againstInvoice ? { bills: [{ name: doc.againstInvoice, type: 'Agst Ref' as const, paise: -doc.totalPaise }] } : {}) }], l.roundOff) }
}

/** Receipt: Dr bank or cash (money received), Dr TDS receivable (withheld); Cr party (both). */
export function receiptVoucher(doc: ReceiptDoc, l: TallyLedgers): Voucher {
  return {
    type: 'Receipt',
    date: doc.date,
    number: doc.number,
    party: doc.party,
    narration: doc.narration ?? `Receipt ${doc.number}`,
    entries: tidy([{ ledger: doc.cash ? l.cash : l.bank, paise: doc.amountPaise }, { ledger: l.tdsReceivable, paise: doc.tdsPaise }, { ledger: doc.party, paise: -(doc.amountPaise + doc.tdsPaise), bills: receiptBills(doc) }]),
  }
}

/** Agst Ref per settled invoice; anything not applied to an invoice stays On Account (an advance). */
function receiptBills(doc: ReceiptDoc): BillRef[] | undefined {
  const settled = (doc.settles ?? []).filter((s) => s.paise > 0)
  if (!settled.length) return undefined
  const left = doc.amountPaise + doc.tdsPaise - settled.reduce((sum, s) => sum + s.paise, 0)
  return [...settled.map((s) => ({ name: s.invoice, type: 'Agst Ref' as const, paise: -s.paise })), ...(left > 0 ? [{ name: doc.number, type: 'On Account' as const, paise: -left }] : [])]
}

/** Write-off as a Journal: Dr write-off ledger; Cr party against the invoice, so its bill closes in Tally too. */
export function writeOffVoucher(doc: WriteOffDoc, l: TallyLedgers): Voucher {
  return {
    type: 'Journal',
    date: doc.date,
    number: `WO-${doc.invoice}`,
    party: doc.party,
    narration: `Written off: invoice ${doc.invoice}${doc.reason ? ` · ${doc.reason}` : ''}`,
    entries: tidy([{ ledger: l.writeOff, paise: doc.amountPaise }, { ledger: doc.party, paise: -doc.amountPaise, bills: [{ name: doc.invoice, type: 'Agst Ref', paise: -doc.amountPaise }] }]),
  }
}

/** Expense as a Payment (or Journal): Dr category (net of claimable GST), Dr input GST; Cr bank or cash. */
export function expenseVoucher(doc: ExpenseDoc, l: TallyLedgers, type: 'Payment' | 'Journal' = 'Payment'): Voucher {
  const gst = doc.itc ? doc.gstPaise : 0
  const half = Math.floor(gst / 2)
  const input = !gst ? [] : doc.interState ? [{ ledger: l.inputIgst, paise: gst }] : [{ ledger: l.inputCgst, paise: half }, { ledger: l.inputSgst, paise: gst - half }]
  return {
    type,
    date: doc.date,
    number: doc.number,
    party: null,
    narration: doc.narration ?? `${doc.vendor}${doc.number ? ` · ${doc.number}` : ''}`,
    entries: tidy([{ ledger: doc.category, paise: doc.amountPaise - gst }, ...input, { ledger: doc.cash ? l.cash : l.bank, paise: -doc.amountPaise }]),
  }
}
