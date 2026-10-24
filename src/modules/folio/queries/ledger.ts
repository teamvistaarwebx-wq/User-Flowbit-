import 'server-only'
import { Types } from 'mongoose'
import { isoDateIST, monthOf, monthRange, shiftMonth, todayIST } from '@/lib/dates'
import { Client } from '@/models/Client'
import { CreditNote } from '@/models/folio/CreditNote'
import { FolioBillingProfile } from '@/models/folio/BillingProfile'
import { FolioReceipt } from '@/models/folio/Receipt'
import { Invoice } from '@/models/folio/Invoice'
import { buildStatement, monthlyLedger, type LedgerRow, type MonthRow, type Statement } from './ledger-math'
import { BILLED_STATUSES, clientLabel, entityMatch, issuerForClient, type EntityInfo, type FolioScope } from './common'

/**
 * The client ledger, built from separate org-scoped queries merged in code
 * (no $unionWith, so no sub-pipeline can escape the org filter).
 */

const oid = (id: Types.ObjectId | string) => (typeof id === 'string' ? new Types.ObjectId(id) : id)

async function invoiceRows(scope: FolioScope, clientId: Types.ObjectId): Promise<{ rows: LedgerRow[]; numbers: Map<string, string> }> {
  const invoices = await scope
    .db(Invoice)
    .find({ clientId, status: { $in: [...BILLED_STATUSES] } }, { number: 1, documentType: 1, billingType: 1, issueDate: 1, totalPaise: 1, subject: 1, writtenOffPaise: 1, writtenOffAt: 1, writeOffReason: 1 })
    .lean()
  const numbers = new Map(invoices.map((i) => [String(i._id), i.number ?? 'Invoice']))
  const rows = invoices.flatMap((i): LedgerRow[] => {
    const id = String(i._id)
    const opening = i.billingType === 'opening'
    const base: LedgerRow = {
      date: i.issueDate,
      type: opening ? 'opening' : i.documentType === 'sale_invoice' ? 'sale_invoice' : 'tax_invoice',
      debitPaise: i.totalPaise ?? 0,
      creditPaise: 0,
      particulars: opening ? 'Opening balance' : i.subject || `Invoice ${i.number}`,
      document: i.number ?? '',
      href: opening ? null : `/app/folio/invoices/${id}`,
      sourceId: id,
    }
    if (!(i.writtenOffPaise && i.writtenOffPaise > 0)) return [base]
    const writeOff: LedgerRow = {
      date: i.writtenOffAt ? isoDateIST(i.writtenOffAt) : i.issueDate,
      type: 'write_off',
      debitPaise: 0,
      creditPaise: i.writtenOffPaise,
      particulars: `Written off · ${i.writeOffReason ?? 'bad debt'}`,
      document: i.number ?? '',
      href: opening ? null : `/app/folio/invoices/${id}`,
      sourceId: `${id}-wo`,
    }
    return [base, writeOff]
  })
  return { rows, numbers }
}

async function receiptRows(scope: FolioScope, clientId: Types.ObjectId, numbers: Map<string, string>, tdsSection: string | null): Promise<LedgerRow[]> {
  const receipts = await scope.db(FolioReceipt).find({ clientId, status: 'recorded' }, { number: 1, receivedOn: 1, amountPaise: 1, reference: 1, allocations: 1 }).lean()
  return receipts.flatMap((r) => {
    const id = String(r._id)
    const cash: LedgerRow = {
      date: r.receivedOn,
      type: 'receipt',
      debitPaise: 0,
      creditPaise: r.amountPaise,
      particulars: r.reference ? `Payment received · ${r.reference}` : 'Payment received',
      document: r.number,
      href: `/app/folio/receipts/${id}`,
      sourceId: id,
    }
    const tds = (r.allocations ?? [])
      .filter((a) => (a.tdsPaise ?? 0) > 0)
      .map(
        (a): LedgerRow => ({
          date: r.receivedOn,
          type: 'tds',
          debitPaise: 0,
          creditPaise: a.tdsPaise ?? 0,
          particulars: ['TDS deducted', tdsSection, numbers.get(String(a.invoiceId))].filter(Boolean).join(' · '),
          document: r.number,
          href: `/app/folio/receipts/${id}`,
          sourceId: `${id}-tds-${String(a._id)}`,
        }),
      )
    return [cash, ...tds]
  })
}

async function creditNoteRows(scope: FolioScope, clientId: Types.ObjectId): Promise<LedgerRow[]> {
  const notes = await scope.db(CreditNote).find({ clientId, status: 'issued' }, { number: 1, noteDate: 1, totalPaise: 1, reasonText: 1 }).lean()
  return notes.map((n): LedgerRow => ({
    date: n.noteDate,
    type: 'credit_note',
    debitPaise: 0,
    creditPaise: n.totalPaise ?? 0,
    particulars: `Credit note · ${n.reasonText ?? ''}`.trim(),
    document: n.number,
    href: `/app/folio/credit-notes/${String(n._id)}`,
    sourceId: String(n._id),
  }))
}

/** Every ledger row for one client, unsorted. */
export async function ledgerRows(scope: FolioScope, clientIdRaw: Types.ObjectId | string): Promise<LedgerRow[]> {
  const clientId = oid(clientIdRaw)
  const profile = await scope.db(FolioBillingProfile).findOne({ clientId }, { tds: 1 }).lean()
  const { rows: inv, numbers } = await invoiceRows(scope, clientId)
  const [rec, cn] = await Promise.all([receiptRows(scope, clientId, numbers, profile?.tds?.section ?? null), creditNoteRows(scope, clientId)])
  return [...inv, ...rec, ...cn]
}

export type ClientStatement = {
  client: { id: string; name: string; legalName: string; addressLines: string[]; gstin: string | null; stateCode: string | null }
  issuer: EntityInfo | null
  statement: Statement
  monthly: MonthRow[]
}

/** Statement of account for one client, or null when the client is not in this org. */
export async function clientStatement(scope: FolioScope, clientId: string, range: { from?: string | null; to?: string | null } = {}): Promise<ClientStatement | null> {
  if (!Types.ObjectId.isValid(clientId)) return null
  const client = await scope.db(Client).findById(clientId).lean()
  if (!client) return null
  const [rows, issuer] = await Promise.all([ledgerRows(scope, client._id), issuerForClient(scope, client._id)])
  const a = client.billingAddress
  return {
    client: {
      id: String(client._id),
      name: clientLabel(client),
      legalName: client.name,
      addressLines: [a?.line1, a?.line2, [a?.city, a?.state, a?.pincode].filter(Boolean).join(' ')].filter((l): l is string => Boolean(l)),
      gstin: client.gstin ?? null,
      stateCode: client.state ?? null,
    },
    issuer,
    statement: buildStatement(rows, { from: range.from, to: range.to ?? todayIST() }),
    monthly: monthlyLedger(rows),
  }
}

export type MonthTotal = { month: string; billedPaise: number; collectedPaise: number }

/** Billed (non-opening issued invoices) against collected (recorded receipts), last `months` IST months; `entityId` narrows to one firm. */
export async function monthlyTotals(scope: FolioScope, months = 6, today: string = todayIST(), entityId?: string | null): Promise<MonthTotal[]> {
  const current = monthOf(today)
  const list = Array.from({ length: months }, (_, i) => shiftMonth(current, i - months + 1))
  const start = monthRange(list[0]).start
  const end = monthRange(current).end
  const [billed, collected] = await Promise.all([
    scope.db(Invoice).aggregate<{ _id: string; n: number }>([
      { $match: { status: { $in: [...BILLED_STATUSES] }, billingType: { $ne: 'opening' }, ...entityMatch(entityId), issueDate: { $gte: start, $lte: end } } },
      { $group: { _id: { $substrBytes: ['$issueDate', 0, 7] }, n: { $sum: '$totalPaise' } } },
    ]),
    scope.db(FolioReceipt).aggregate<{ _id: string; n: number }>([
      { $match: { status: 'recorded', ...entityMatch(entityId), receivedOn: { $gte: start, $lte: end } } },
      { $group: { _id: { $substrBytes: ['$receivedOn', 0, 7] }, n: { $sum: '$amountPaise' } } },
    ]),
  ])
  const b = new Map(billed.map((r) => [r._id, r.n]))
  const c = new Map(collected.map((r) => [r._id, r.n]))
  return list.map((month) => ({ month, billedPaise: b.get(month) ?? 0, collectedPaise: c.get(month) ?? 0 }))
}
