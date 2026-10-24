import 'server-only'
import type { Types } from 'mongoose'
import { shiftMonth } from '@/lib/dates'
import { CreditNote } from '@/models/folio/CreditNote'
import { FolioReceipt } from '@/models/folio/Receipt'
import { Invoice } from '@/models/folio/Invoice'
import { listOutstanding } from './balances'
import { BILLED_STATUSES, clientNameMap, entityMatch, type FolioScope } from './common'
import { agingSlices, CHART_MONTHS, gstSummary, monthlyPairs, monthsBetween, TOP_CLIENTS, type AgingSlice, type GstSummary, type MonthPair, type TaxRow } from './report-charts-math'

/**
 * Data for the charts on Folio → Reports. Every query honours the firm filter (`entityId`); the page
 * already requires folio.reports. Aging is as of today; the rest follow the chosen period.
 */

export type RankRow = { clientId: string; name: string; paise: number }
export type ReportCharts = { aging: AgingSlice[]; monthly: MonthPair[]; topRevenue: RankRow[]; topOutstanding: RankRow[]; gst: GstSummary }

const month = (field: string) => ({ $substrBytes: [field, 0, 7] })

async function monthlyInvoicedCollected(scope: FolioScope, entityId: string | null, today: string): Promise<MonthPair[]> {
  const months = Array.from({ length: CHART_MONTHS }, (_, i) => shiftMonth(today.slice(0, 7), i - (CHART_MONTHS - 1)))
  const from = `${months[0]}-01`
  const [invoiced, collected] = await Promise.all([
    scope.db(Invoice).aggregate<{ _id: string; n: number }>([{ $match: { ...entityMatch(entityId), status: { $in: [...BILLED_STATUSES] }, billingType: { $ne: 'opening' }, issueDate: { $gte: from, $lte: today } } }, { $group: { _id: month('$issueDate'), n: { $sum: '$totalPaise' } } }]),
    scope.db(FolioReceipt).aggregate<{ _id: string; n: number }>([{ $match: { ...entityMatch(entityId), status: 'recorded', receivedOn: { $gte: from, $lte: today } } }, { $group: { _id: month('$receivedOn'), n: { $sum: '$amountPaise' } } }]),
  ])
  return monthlyPairs(months, invoiced, collected)
}

async function topRevenue(scope: FolioScope, entityId: string | null, from: string, to: string): Promise<RankRow[]> {
  const [billed, credited] = await Promise.all([
    scope.db(Invoice).aggregate<{ _id: Types.ObjectId; n: number }>([{ $match: { ...entityMatch(entityId), status: { $in: [...BILLED_STATUSES] }, billingType: { $ne: 'opening' }, issueDate: { $gte: from, $lte: to } } }, { $group: { _id: '$clientId', n: { $sum: '$taxablePaise' } } }]),
    scope.db(CreditNote).aggregate<{ _id: Types.ObjectId; n: number }>([{ $match: { ...entityMatch(entityId), status: 'issued', noteDate: { $gte: from, $lte: to } } }, { $group: { _id: '$clientId', n: { $sum: '$taxablePaise' } } }]),
  ])
  const credit = new Map(credited.map((c) => [String(c._id), c.n]))
  return billed.map((b) => ({ clientId: String(b._id), name: '', paise: b.n - (credit.get(String(b._id)) ?? 0) })).filter((r) => r.paise > 0).sort((a, b) => b.paise - a.paise).slice(0, TOP_CLIENTS)
}

type TaxAgg = { _id: { month: string; rate: number; rc?: boolean }; taxable: number; cgst: number; sgst: number; igst: number }

async function taxRows(scope: FolioScope, entityId: string | null, from: string, to: string): Promise<{ invoices: TaxRow[]; credits: TaxRow[] }> {
  const group = (dateField: string) => ({ $group: { _id: { month: month(dateField), rate: '$lines.gstRatePercent', rc: { $ifNull: ['$reverseCharge', false] } }, taxable: { $sum: '$lines.taxablePaise' }, cgst: { $sum: '$lines.cgstPaise' }, sgst: { $sum: '$lines.sgstPaise' }, igst: { $sum: '$lines.igstPaise' } } })
  const [inv, cn] = await Promise.all([
    scope.db(Invoice).aggregate<TaxAgg>([{ $match: { ...entityMatch(entityId), status: { $nin: ['draft', 'void'] }, billingType: { $ne: 'opening' }, issueDate: { $gte: from, $lte: to } } }, { $unwind: '$lines' }, group('$issueDate')]),
    scope.db(CreditNote).aggregate<TaxAgg>([{ $match: { ...entityMatch(entityId), status: 'issued', noteDate: { $gte: from, $lte: to } } }, { $unwind: '$lines' }, group('$noteDate')]),
  ])
  const toRow = (r: TaxAgg): TaxRow => ({ month: r._id.month, rate: r._id.rate ?? 0, taxablePaise: r.taxable, cgstPaise: r.cgst, sgstPaise: r.sgst, igstPaise: r.igst, reverseCharge: Boolean(r._id.rc) })
  return { invoices: inv.map(toRow), credits: cn.map(toRow) }
}

export async function reportCharts(scope: FolioScope, p: { from: string; to: string; entityId: string | null }, today: string): Promise<ReportCharts> {
  const [open, monthly, revenue, tax] = await Promise.all([
    listOutstanding(scope, undefined, today, p.entityId),
    monthlyInvoicedCollected(scope, p.entityId, today),
    topRevenue(scope, p.entityId, p.from, p.to),
    taxRows(scope, p.entityId, p.from, p.to),
  ])
  const owed = new Map<string, { name: string; paise: number }>()
  for (const r of open) owed.set(r.clientId, { name: r.clientName, paise: (owed.get(r.clientId)?.paise ?? 0) + r.balancePaise })
  const topOutstanding = [...owed.entries()].map(([clientId, v]) => ({ clientId, ...v })).filter((r) => r.paise > 0).sort((a, b) => b.paise - a.paise).slice(0, TOP_CLIENTS)
  const names = await clientNameMap(scope, revenue.map((r) => r.clientId))
  return {
    aging: agingSlices(open, today),
    monthly,
    topRevenue: revenue.map((r) => ({ ...r, name: names.get(r.clientId) ?? 'Unknown client' })),
    topOutstanding,
    gst: gstSummary(tax.invoices, tax.credits, monthsBetween(p.from, p.to)),
  }
}
