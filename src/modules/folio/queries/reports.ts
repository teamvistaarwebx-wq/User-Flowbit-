import 'server-only'
import { Types } from 'mongoose'
import { formatDate, formatMonth, monthOf, shiftMonth, todayIST } from '@/lib/dates'
import { pct } from '@/lib/money'
import { statusLabel } from '@/lib/status'
import { CreditNote } from '@/models/folio/CreditNote'
import { FolioReceipt } from '@/models/folio/Receipt'
import { Invoice } from '@/models/folio/Invoice'
import { AGING_BUCKETS } from '@/modules/folio/engine/aging'
import { SUPPLY_TYPE_LABELS, type SupplyType } from '@/modules/folio/engine/gst'
import { placeOfSupplyLabel } from '@/modules/folio/engine/states'
import { RECEIPT_MODE_LABELS, allocatedPaise, tdsWithheldPaise, type ReceiptMode } from '@/modules/folio/receipts/rules'
import { listOutstanding } from './balances'
import { BILLED_STATUSES, clientNameMap, listEntities, type FolioScope } from './common'
import { col, periodLabel, sumCol, type ReportCell, type ReportKey, type ReportParams, type ReportTable } from './report-types'
import { gstReport } from './reports-gst'

/** Sales register, collections, aging and revenue (folio.md 6.17). */

export const CONCENTRATION_WARN_PCT = 30

const entityFilter = (p: ReportParams) => (p.entityId && Types.ObjectId.isValid(p.entityId) ? { entityId: new Types.ObjectId(p.entityId) } : {})

async function salesRegister(scope: FolioScope, p: ReportParams): Promise<ReportTable> {
  const [invoices, notes] = await Promise.all([
    scope.db(Invoice).find({ ...entityFilter(p), status: { $ne: 'draft' }, billingType: { $ne: 'opening' }, issueDate: { $gte: p.from, $lte: p.to } }).sort({ issueDate: 1, seq: 1 }).lean(),
    scope.db(CreditNote).find({ ...entityFilter(p), status: 'issued', noteDate: { $gte: p.from, $lte: p.to } }).sort({ noteDate: 1, seq: 1 }).lean(),
  ])
  const names = await clientNameMap(scope, [...new Set([...invoices, ...notes].map((d) => String(d.clientId)))])
  const supply = (s: string | null | undefined) => SUPPLY_TYPE_LABELS[(s ?? 'exempt') as SupplyType] ?? ''
  const invoiceRows: ReportCell[][] = invoices.map((i) => {
    const counted = i.status !== 'void'
    return [
      i.number ?? null,
      i.issueDate,
      i.documentType === 'sale_invoice' ? 'Sale invoice' : 'Tax invoice',
      names.get(String(i.clientId)) ?? '',
      i.clientGstin ?? '',
      placeOfSupplyLabel(i.placeOfSupplyStateCode),
      supply(i.supplyType),
      counted ? (i.taxablePaise ?? 0) : 0,
      counted ? (i.cgstPaise ?? 0) : 0,
      counted ? (i.sgstPaise ?? 0) : 0,
      counted ? (i.igstPaise ?? 0) : 0,
      counted ? (i.totalPaise ?? 0) : 0,
      i.status !== 'void' && (i.writtenOffPaise ?? 0) > 0 ? 'Written off' : statusLabel(i.status),
    ]
  })
  const noteRows: ReportCell[][] = notes.map((n) => [n.number, n.noteDate, 'Credit note', names.get(String(n.clientId)) ?? '', n.clientGstin ?? '', placeOfSupplyLabel(n.placeOfSupplyStateCode), supply(n.supplyType), -(n.taxablePaise ?? 0), -(n.cgstPaise ?? 0), -(n.sgstPaise ?? 0), -(n.igstPaise ?? 0), -(n.totalPaise ?? 0), 'Issued'])
  const rows = [...invoiceRows, ...noteRows]
  return {
    title: 'Sales register',
    period: periodLabel(p.from, p.to),
    empty: 'Nothing issued in this period.',
    note: 'Void invoices are listed with zero value so the series reads without gaps. Credit notes follow, as negatives.',
    columns: [col('Number'), col('Date', 'date'), col('Document'), col('Client'), col('Client GSTIN'), col('Place of supply'), col('Supply'), col('Taxable', 'money'), col('CGST', 'money'), col('SGST', 'money'), col('IGST', 'money'), col('Total', 'money'), col('Status')],
    rows,
    totals: rows.length ? ['Total', null, null, null, null, null, null, sumCol(rows, 7), sumCol(rows, 8), sumCol(rows, 9), sumCol(rows, 10), sumCol(rows, 11), null] : null,
  }
}

async function collectionsReport(scope: FolioScope, p: ReportParams): Promise<ReportTable> {
  const receipts = await scope.db(FolioReceipt).find({ ...entityFilter(p), status: 'recorded', receivedOn: { $gte: p.from, $lte: p.to } }).sort({ receivedOn: 1, seq: 1 }).lean()
  const [names, entities] = await Promise.all([clientNameMap(scope, [...new Set(receipts.map((r) => String(r.clientId)))]), listEntities(scope)])
  const codes = new Map(entities.map((e) => [e.id, e.code]))
  const rows: ReportCell[][] = receipts.map((r) => {
    const applied = allocatedPaise(r.allocations ?? [])
    return [r.number, r.receivedOn, names.get(String(r.clientId)) ?? '', codes.get(String(r.entityId)) ?? '', RECEIPT_MODE_LABELS[(r.mode ?? 'other') as ReceiptMode], r.reference ?? '', r.amountPaise, applied, tdsWithheldPaise(r.allocations ?? []), r.amountPaise - applied]
  })
  return {
    title: 'Collections',
    period: periodLabel(p.from, p.to),
    empty: 'No payments in this period.',
    columns: [col('Receipt'), col('Received on', 'date'), col('Client'), col('Firm'), col('Mode'), col('Reference'), col('Amount', 'money'), col('Applied', 'money'), col('TDS', 'money'), col('Unapplied', 'money')],
    rows,
    totals: rows.length ? ['Total received', null, null, null, null, null, sumCol(rows, 6), sumCol(rows, 7), sumCol(rows, 8), sumCol(rows, 9)] : null,
  }
}

async function agingReport(scope: FolioScope, p: ReportParams, today: string): Promise<ReportTable> {
  const open = (await listOutstanding(scope, undefined, today)).filter((r) => !p.entityId || r.entityId === p.entityId)
  const byClient = new Map<string, { name: string; buckets: number[] }>()
  for (const r of open) {
    const cur = byClient.get(r.clientId) ?? { name: r.clientName, buckets: AGING_BUCKETS.map(() => 0) }
    const idx = AGING_BUCKETS.indexOf(r.bucket)
    byClient.set(r.clientId, { ...cur, buckets: cur.buckets.map((v, i) => (i === idx ? v + r.balancePaise : v)) })
  }
  const rows: ReportCell[][] = [...byClient.values()]
    .map((c) => [c.name, ...c.buckets, c.buckets.reduce((s, v) => s + v, 0)])
    .sort((a, b) => (b[6] as number) - (a[6] as number))
  return {
    title: 'Aging',
    period: `As at ${formatDate(today)}`,
    empty: 'Nothing outstanding. Every invoice is settled.',
    note: 'Aging is always as of today, not the end of the chosen period.',
    columns: [col('Client'), col('Not due', 'money'), col('1–30', 'money'), col('31–60', 'money'), col('61–90', 'money'), col('90+', 'money'), col('Total', 'money')],
    rows,
    totals: rows.length ? ['Total', ...[1, 2, 3, 4, 5, 6].map((i) => sumCol(rows, i))] : null,
  }
}

async function revenueByClient(scope: FolioScope, p: ReportParams): Promise<ReportTable> {
  const match = { ...entityFilter(p), status: { $in: [...BILLED_STATUSES] }, billingType: { $ne: 'opening' }, issueDate: { $gte: p.from, $lte: p.to } }
  const [billed, credited] = await Promise.all([
    scope.db(Invoice).aggregate<{ _id: Types.ObjectId; n: number; count: number }>([{ $match: match }, { $group: { _id: '$clientId', n: { $sum: '$taxablePaise' }, count: { $sum: 1 } } }]),
    scope.db(CreditNote).aggregate<{ _id: Types.ObjectId; n: number }>([{ $match: { ...entityFilter(p), status: 'issued', noteDate: { $gte: p.from, $lte: p.to } } }, { $group: { _id: '$clientId', n: { $sum: '$taxablePaise' } } }]),
  ])
  const cn = new Map(credited.map((c) => [String(c._id), c.n]))
  const ids = [...new Set([...billed.map((b) => String(b._id)), ...cn.keys()])]
  const names = await clientNameMap(scope, ids)
  const counts = new Map(billed.map((b) => [String(b._id), b]))
  const net = ids.map((id) => ({ id, count: counts.get(id)?.count ?? 0, revenue: (counts.get(id)?.n ?? 0) - (cn.get(id) ?? 0) })).sort((a, b) => b.revenue - a.revenue)
  const total = net.reduce((s, r) => s + r.revenue, 0)
  const rows: ReportCell[][] = net.map((r) => [names.get(r.id) ?? '', r.count, r.revenue, pct(r.revenue, total)])
  return {
    title: 'Revenue by client',
    period: periodLabel(p.from, p.to),
    empty: 'No revenue in this period.',
    note: 'Revenue is taxable value (tax excluded), net of credit notes. Written-off invoices stay in, to match the GST figures.',
    columns: [col('Client'), col('Invoices', 'number'), col('Revenue', 'money'), col('Share', 'percent')],
    rows,
    totals: rows.length ? ['Total', sumCol(rows, 1), total, 100] : null,
    flagged: rows.map((r, i) => ((r[3] as number) >= CONCENTRATION_WARN_PCT ? i : -1)).filter((i) => i >= 0),
  }
}

async function revenueByMonth(scope: FolioScope, p: ReportParams): Promise<ReportTable> {
  const months: string[] = []
  for (let m = monthOf(p.from); m <= monthOf(p.to); m = shiftMonth(m, 1)) months.push(m)
  const month = (field: string) => ({ $substrBytes: [field, 0, 7] })
  const [billed, credited, collected] = await Promise.all([
    scope.db(Invoice).aggregate<{ _id: string; n: number }>([{ $match: { ...entityFilter(p), status: { $in: [...BILLED_STATUSES] }, billingType: { $ne: 'opening' }, issueDate: { $gte: p.from, $lte: p.to } } }, { $group: { _id: month('$issueDate'), n: { $sum: '$taxablePaise' } } }]),
    scope.db(CreditNote).aggregate<{ _id: string; n: number }>([{ $match: { ...entityFilter(p), status: 'issued', noteDate: { $gte: p.from, $lte: p.to } } }, { $group: { _id: month('$noteDate'), n: { $sum: '$taxablePaise' } } }]),
    scope.db(FolioReceipt).aggregate<{ _id: string; n: number }>([{ $match: { ...entityFilter(p), status: 'recorded', receivedOn: { $gte: p.from, $lte: p.to } } }, { $group: { _id: month('$receivedOn'), n: { $sum: '$amountPaise' } } }]),
  ])
  const get = (rows: { _id: string; n: number }[], m: string) => rows.find((r) => r._id === m)?.n ?? 0
  const rows: ReportCell[][] = months.map((m) => [formatMonth(m), get(billed, m) - get(credited, m), get(collected, m)])
  const hasData = rows.some((r) => r[1] !== 0 || r[2] !== 0)
  return {
    title: 'Revenue by month',
    period: periodLabel(p.from, p.to),
    empty: 'No revenue in this period.',
    note: 'Billed is taxable value net of credit notes; collected is cash received (tax included).',
    columns: [col('Month'), col('Billed (taxable)', 'money'), col('Collected', 'money')],
    rows: hasData ? rows : [],
    totals: hasData ? ['Total', sumCol(rows, 1), sumCol(rows, 2)] : null,
  }
}

export async function runReport(scope: FolioScope, key: ReportKey, p: ReportParams, today: string = todayIST()): Promise<ReportTable> {
  switch (key) {
    case 'gst':
      return gstReport(scope, p)
    case 'sales':
      return salesRegister(scope, p)
    case 'collections':
      return collectionsReport(scope, p)
    case 'aging':
      return agingReport(scope, p, today)
    default:
      return p.by === 'month' ? revenueByMonth(scope, p) : revenueByClient(scope, p)
  }
}
