import 'server-only'
import { Client } from '@/models/Client'
import { CreditNote } from '@/models/folio/CreditNote'
import { FolioEntity } from '@/models/folio/Entity'
import { FolioExpense } from '@/models/folio/Expense'
import { FolioExpenseCategory } from '@/models/folio/ExpenseCategory'
import { FolioReceipt } from '@/models/folio/Receipt'
import { Invoice } from '@/models/folio/Invoice'
import { clientLabel } from '@/modules/folio/context'
import { stateCodeOfGstin } from '@/modules/folio/engine/gst'
import { stateName } from '@/modules/folio/engine/states'
import { entityMatch, type FolioScope } from '@/modules/folio/queries/common'
import { getFolioSettings } from '@/modules/folio/settings/queries'
import { resolveTallyLedgers } from './ledgers'
import { creditNoteVoucher, expenseVoucher, receiptVoucher, salesVoucher, writeOffVoucher, type TaxLine, type Voucher } from './vouchers'
import { isoDateIST } from '@/lib/dates'
import { toTallyXml, type PartyMaster } from './xml'

/**
 * Builds the Tally import file for one firm (or all) and a date range: invoices as Sales, credit notes,
 * receipts and expenses (Payment, or Journal on request), optionally with party ledger masters.
 * Beta: the owner should check a test import in Tally before relying on it.
 */

export type TallyOptions = { from: string; to: string; entityId: string | null; masters: boolean; expensesAs: 'Payment' | 'Journal'; /** False when the viewer may not read expenses. */ expenses: boolean }
export type TallyResult = { xml: string; /** A document kind hit MAX_DOCS: ask for a shorter period instead of a partial file. */ tooMany: boolean; counts: { sales: number; creditNotes: number; receipts: number; expenses: number; parties: number } }

/** Upper bound per document kind, so one export stays a sensible size. */
const MAX_DOCS = 5000

type Line = { gstRatePercent?: number | null; cgstPaise?: number | null; sgstPaise?: number | null; igstPaise?: number | null }
const taxLines = (lines: readonly Line[] | null | undefined): TaxLine[] => (lines ?? []).map((l) => ({ rate: l.gstRatePercent ?? 0, cgstPaise: l.cgstPaise ?? 0, sgstPaise: l.sgstPaise ?? 0, igstPaise: l.igstPaise ?? 0 }))

/**
 * Line taxes scaled to the document's header totals: lines can differ from the header by rounding, and the
 * header is what was filed. Any difference sits on the largest line of that tax.
 */
function matchHeader(lines: TaxLine[], header: { cgstPaise?: number | null; sgstPaise?: number | null; igstPaise?: number | null }): TaxLine[] {
  const fix = (key: 'cgstPaise' | 'sgstPaise' | 'igstPaise', rows: TaxLine[]): TaxLine[] => {
    const diff = (header[key] ?? 0) - rows.reduce((s, r) => s + r[key], 0)
    if (!diff) return rows
    if (!rows.length) return [{ rate: 0, cgstPaise: 0, sgstPaise: 0, igstPaise: 0, [key]: diff }]
    const biggest = rows.reduce((best, r, i) => (r[key] > rows[best][key] ? i : best), 0)
    return rows.map((r, i) => (i === biggest ? { ...r, [key]: r[key] + diff } : r))
  }
  return fix('igstPaise', fix('sgstPaise', fix('cgstPaise', lines)))
}

/** Invoice numbers by id, for bill references on credit notes and receipts. */
async function invoiceNumberMap(scope: FolioScope, ids: readonly unknown[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.map(String))]
  if (!unique.length) return new Map()
  const rows = await scope.db(Invoice).find({ _id: { $in: unique } }, { number: 1 }).lean()
  return new Map(rows.filter((r) => r.number).map((r) => [String(r._id), r.number as string]))
}

export async function buildTallyExport(scope: FolioScope, opts: TallyOptions): Promise<TallyResult> {
  const range = (field: string) => ({ [field]: { $gte: opts.from, $lte: opts.to } })
  const firm = entityMatch(opts.entityId)
  const [settings, invoices, notes, receipts, expenses, entities, categories, writeOffs] = await Promise.all([
    getFolioSettings(scope),
    scope.db(Invoice).find({ ...firm, status: { $nin: ['draft', 'void'] }, billingType: { $ne: 'opening' }, ...range('issueDate') }).sort({ issueDate: 1, seq: 1 }).limit(MAX_DOCS).lean(),
    scope.db(CreditNote).find({ ...firm, status: 'issued', ...range('noteDate') }).sort({ noteDate: 1, seq: 1 }).limit(MAX_DOCS).lean(),
    scope.db(FolioReceipt).find({ ...firm, status: 'recorded', ...range('receivedOn') }).sort({ receivedOn: 1, seq: 1 }).limit(MAX_DOCS).lean(),
    opts.expenses ? scope.db(FolioExpense).find({ ...firm, ...range('date') }).sort({ date: 1, _id: 1 }).limit(MAX_DOCS).lean() : [],
    scope.db(FolioEntity).find({}, { legalName: 1, gstin: 1 }).lean(),
    scope.db(FolioExpenseCategory).find({}, { name: 1 }).lean(),
    scope.db(Invoice).find({ ...firm, writtenOffPaise: { $gt: 0 }, writtenOffAt: { $gte: new Date(`${opts.from}T00:00:00+05:30`), $lte: new Date(`${opts.to}T23:59:59.999+05:30`) } }, { number: 1, clientId: 1, writtenOffPaise: 1, writtenOffAt: 1, writeOffReason: 1 }).limit(MAX_DOCS).lean(),
  ])
  const tooMany = [invoices, notes, receipts, expenses, writeOffs].some((rows) => rows.length >= MAX_DOCS)
  const stored = (settings.tally ?? null) as Record<string, unknown> | null
  const ledgers = resolveTallyLedgers(stored)
  const company = typeof stored?.company === 'string' && stored.company ? stored.company : null
  const clientIds = [...new Set([...invoices, ...notes, ...receipts, ...writeOffs].map((d) => String(d.clientId)))]
  const invoiceNumbers = await invoiceNumberMap(scope, [...notes.map((n) => n.invoiceId), ...receipts.flatMap((r) => (r.allocations ?? []).map((a) => a.invoiceId))])
  const clients = await scope.db(Client).find({ _id: { $in: clientIds } }, { name: 1, displayName: 1, gstin: 1, state: 1 }).lean()
  const party = new Map(clients.map((c) => [String(c._id), clientLabel(c)]))
  const partyOf = (id: unknown) => party.get(String(id)) ?? 'Unknown client'
  const entityState = new Map(entities.map((e) => [String(e._id), e.gstin ? stateCodeOfGstin(e.gstin) : null]))
  const category = new Map(categories.map((c) => [String(c._id), c.name]))

  const vouchers: Voucher[] = [
    ...invoices.map((i) => salesVoucher({ number: i.number ?? String(i._id), date: i.issueDate, party: partyOf(i.clientId), totalPaise: i.totalPaise ?? 0, taxablePaise: i.taxablePaise ?? 0, lines: matchHeader(taxLines(i.lines), i), reverseCharge: Boolean(i.reverseCharge), narration: i.subject ? `Invoice ${i.number}: ${i.subject}` : undefined }, ledgers)),
    ...notes.map((n) => creditNoteVoucher({ number: n.number, date: n.noteDate, party: partyOf(n.clientId), totalPaise: n.totalPaise ?? 0, taxablePaise: n.taxablePaise ?? 0, lines: matchHeader(taxLines(n.lines), n), reverseCharge: Boolean(n.reverseCharge), againstInvoice: invoiceNumbers.get(String(n.invoiceId)) }, ledgers)),
    ...receipts.map((r) => receiptVoucher({ number: r.number, date: r.receivedOn, party: partyOf(r.clientId), amountPaise: r.amountPaise, tdsPaise: (r.allocations ?? []).reduce((s, a) => s + (a.tdsPaise ?? 0), 0), cash: r.mode === 'cash', narration: r.reference ? `Receipt ${r.number} · ${r.reference}` : undefined, settles: (r.allocations ?? []).flatMap((a) => { const invoice = invoiceNumbers.get(String(a.invoiceId)); return invoice ? [{ invoice, paise: (a.amountPaise ?? 0) + (a.tdsPaise ?? 0) }] : [] }) }, ledgers)),
    ...writeOffs.filter((w) => w.number && w.writtenOffAt).map((w) => writeOffVoucher({ invoice: w.number!, date: isoDateIST(w.writtenOffAt!), party: partyOf(w.clientId), amountPaise: w.writtenOffPaise ?? 0, reason: w.writeOffReason ?? undefined }, ledgers)),
    ...expenses.map((e) => {
      const vendorState = e.vendorGstin ? stateCodeOfGstin(e.vendorGstin) : null
      const ownState = entityState.get(String(e.entityId)) ?? null
      return expenseVoucher({ number: e.reference ?? '', date: e.date, category: category.get(String(e.categoryId)) ?? 'Expenses', vendor: e.vendor, amountPaise: e.amountPaise, gstPaise: e.gstPaise ?? 0, itc: Boolean(e.itcEligible), interState: Boolean(vendorState && ownState && vendorState !== ownState), cash: e.paidFrom === 'cash', narration: e.description ? `${e.vendor} · ${e.description}` : undefined }, ledgers, opts.expensesAs)
    }),
  ]
  const parties: PartyMaster[] = opts.masters ? clients.map((c) => ({ name: clientLabel(c), gstin: c.gstin ?? null, state: (c.gstin ? stateName(stateCodeOfGstin(c.gstin)) : '') || null })) : []
  return {
    tooMany,
    xml: tooMany ? '' : toTallyXml({ company, vouchers, parties, debtorsGroup: ledgers.debtorsGroup }),
    counts: { sales: invoices.length, creditNotes: notes.length, receipts: receipts.length, expenses: expenses.length, parties: parties.length },
  }
}
