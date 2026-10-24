import 'server-only'
import { Types } from 'mongoose'
import { CreditNote } from '@/models/folio/CreditNote'
import { Invoice } from '@/models/folio/Invoice'
import { placeOfSupplyLabel } from '@/modules/folio/engine/states'
import { SUPPLY_TYPE_LABELS, type SupplyType } from '@/modules/folio/engine/gst'
import { BILLED_STATUSES, type FolioScope } from './common'
import { col, GST_SECTION_LABELS, periodLabel, sumCol, type ReportCell, type ReportParams, type ReportTable } from './report-types'

/**
 * GSTR-1 preparation for one GST entity (folio.md 6.17.1). Tax invoices only:
 * sale invoices carry no tax and have no place in a return. Written-off
 * amounts stay in (the tax was due); void, draft and opening rows stay out.
 */

/** B2C large: inter-state, unregistered, invoice value above ₹1,00,000. Verify the current threshold before filing. */
export const B2CL_THRESHOLD_PAISE = 1_00_000_00

const EMPTY = 'No tax invoices in this period. Only the GST firm’s issued tax invoices appear here — sale invoices carry no tax and have no place in a return.'

type Line = { gstRatePercent?: number | null; taxablePaise?: number | null; cgstPaise?: number | null; sgstPaise?: number | null; igstPaise?: number | null; hsnSac?: string | null; quantity?: number | null }
type Tax = { taxable: number; cgst: number; sgst: number; igst: number; qty: number }

function byRate(lines: readonly Line[]): Map<number, Tax> {
  const out = new Map<number, Tax>()
  for (const l of lines) {
    const rate = l.gstRatePercent ?? 0
    const cur = out.get(rate) ?? { taxable: 0, cgst: 0, sgst: 0, igst: 0, qty: 0 }
    out.set(rate, { taxable: cur.taxable + (l.taxablePaise ?? 0), cgst: cur.cgst + (l.cgstPaise ?? 0), sgst: cur.sgst + (l.sgstPaise ?? 0), igst: cur.igst + (l.igstPaise ?? 0), qty: cur.qty + (l.quantity ?? 0) })
  }
  return out
}

async function loadInvoices(scope: FolioScope, p: ReportParams, entityId: Types.ObjectId) {
  return scope
    .db(Invoice)
    .find({ entityId, documentType: 'tax_invoice', status: { $in: [...BILLED_STATUSES] }, billingType: { $ne: 'opening' }, issueDate: { $gte: p.from, $lte: p.to } })
    .sort({ issueDate: 1, seq: 1 })
    .lean()
}

async function loadCreditNotes(scope: FolioScope, p: ReportParams, entityId: Types.ObjectId) {
  return scope.db(CreditNote).find({ entityId, documentType: 'tax_invoice', status: 'issued', noteDate: { $gte: p.from, $lte: p.to } }).sort({ noteDate: 1, seq: 1 }).lean()
}

type Inv = Awaited<ReturnType<typeof loadInvoices>>[number]
type Cn = Awaited<ReturnType<typeof loadCreditNotes>>[number]

const taxCols = [col('Taxable', 'money'), col('IGST', 'money'), col('CGST', 'money'), col('SGST', 'money')]
const taxCells = (t: Tax): ReportCell[] => [t.taxable, t.igst, t.cgst, t.sgst]
const isUnregistered = (i: Inv) => !i.clientGstin
const isZeroRated = (i: Inv) => i.supplyType === 'export' || i.supplyType === 'sez'

function summary(invoices: Inv[], notes: Cn[]): Pick<ReportTable, 'columns' | 'rows' | 'totals'> {
  const groups = new Map<string, Tax & { label: string; rate: number; invoices: Set<string> }>()
  for (const inv of invoices) {
    for (const [rate, t] of byRate(inv.lines ?? [])) {
      const key = `${rate}|${inv.supplyType}`
      const cur = groups.get(key) ?? { label: SUPPLY_TYPE_LABELS[(inv.supplyType ?? 'inter_state') as SupplyType], rate, taxable: 0, cgst: 0, sgst: 0, igst: 0, qty: 0, invoices: new Set<string>() }
      groups.set(key, { ...cur, taxable: cur.taxable + t.taxable, cgst: cur.cgst + t.cgst, sgst: cur.sgst + t.sgst, igst: cur.igst + t.igst, invoices: new Set([...cur.invoices, String(inv._id)]) })
    }
  }
  const rows: ReportCell[][] = [...groups.values()].sort((a, b) => a.rate - b.rate || a.label.localeCompare(b.label)).map((g) => [g.label, g.rate, g.invoices.size, ...taxCells(g)])
  for (const [rate, t] of byRate(notes.flatMap((n) => n.lines ?? []))) rows.push(['Credit notes', rate, notes.filter((n) => (n.lines ?? []).some((l) => (l.gstRatePercent ?? 0) === rate)).length, -t.taxable, -t.igst, -t.cgst, -t.sgst])
  return {
    columns: [col('Supply'), col('Rate %', 'number'), col('Documents', 'number'), ...taxCols],
    rows,
    totals: rows.length ? ['Net', null, null, sumCol(rows, 3), sumCol(rows, 4), sumCol(rows, 5), sumCol(rows, 6)] : null,
  }
}

function invoiceWise(invoices: Inv[], withGstin: boolean): ReportCell[][] {
  return invoices.flatMap((inv) =>
    [...byRate(inv.lines ?? [])].map(([rate, t]) => [
      ...(withGstin ? [inv.clientGstin ?? '', inv.billTo?.name ?? ''] : [inv.billTo?.name ?? '']),
      inv.number ?? null,
      inv.issueDate,
      inv.totalPaise ?? 0,
      placeOfSupplyLabel(inv.placeOfSupplyStateCode),
      ...(withGstin ? [inv.reverseCharge ? 'Y' : 'N'] : []),
      rate,
      ...taxCells(t),
    ]),
  )
}

function b2cs(invoices: Inv[]): ReportCell[][] {
  const groups = new Map<string, Tax & { pos: string; rate: number }>()
  for (const inv of invoices) {
    for (const [rate, t] of byRate(inv.lines ?? [])) {
      const pos = placeOfSupplyLabel(inv.placeOfSupplyStateCode)
      const cur = groups.get(`${pos}|${rate}`) ?? { pos, rate, taxable: 0, cgst: 0, sgst: 0, igst: 0, qty: 0 }
      groups.set(`${pos}|${rate}`, { ...cur, taxable: cur.taxable + t.taxable, cgst: cur.cgst + t.cgst, sgst: cur.sgst + t.sgst, igst: cur.igst + t.igst })
    }
  }
  return [...groups.values()].sort((a, b) => a.pos.localeCompare(b.pos) || a.rate - b.rate).map((g) => [g.pos, g.rate, ...taxCells(g)])
}

function hsn(invoices: Inv[]): ReportCell[][] {
  const groups = new Map<string, Tax & { code: string; rate: number }>()
  for (const l of invoices.flatMap((i) => i.lines ?? [])) {
    const code = l.hsnSac || 'Not given'
    const rate = l.gstRatePercent ?? 0
    const cur = groups.get(`${code}|${rate}`) ?? { code, rate, taxable: 0, cgst: 0, sgst: 0, igst: 0, qty: 0 }
    groups.set(`${code}|${rate}`, { ...cur, qty: cur.qty + (l.quantity ?? 0), taxable: cur.taxable + (l.taxablePaise ?? 0), cgst: cur.cgst + (l.cgstPaise ?? 0), sgst: cur.sgst + (l.sgstPaise ?? 0), igst: cur.igst + (l.igstPaise ?? 0) })
  }
  return [...groups.values()].sort((a, b) => a.code.localeCompare(b.code) || a.rate - b.rate).map((g) => [g.code, g.rate, Number(g.qty.toFixed(3)), ...taxCells(g)])
}

async function documentsIssued(scope: FolioScope, p: ReportParams, entityId: Types.ObjectId): Promise<ReportCell[][]> {
  const [invoices, notes] = await Promise.all([
    scope.db(Invoice).find({ entityId, number: { $type: 'string' }, status: { $ne: 'draft' }, billingType: { $ne: 'opening' }, issueDate: { $gte: p.from, $lte: p.to } }, { number: 1, seq: 1, status: 1 }).lean(),
    scope.db(CreditNote).find({ entityId, noteDate: { $gte: p.from, $lte: p.to } }, { number: 1, seq: 1, status: 1 }).lean(),
  ])
  const series = (kind: string, docs: { number?: string | null; seq?: number | null; status?: string | null }[], cancelled: string): ReportCell[][] => {
    const groups = new Map<string, typeof docs>()
    for (const d of docs) {
      const n = d.number ?? ''
      const key = n.slice(0, n.lastIndexOf('/'))
      groups.set(key, [...(groups.get(key) ?? []), d])
    }
    return [...groups.entries()].map(([key, list]) => {
      const sorted = [...list].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))
      return [kind, key, sorted[0]?.number ?? '', sorted[sorted.length - 1]?.number ?? '', list.length, list.filter((d) => d.status === cancelled).length]
    })
  }
  return [...series('Invoices', invoices, 'void'), ...series('Credit notes', notes, 'cancelled')]
}

function creditNoteRows(notes: Cn[], invoiceNumbers: Map<string, string>): ReportCell[][] {
  return notes.flatMap((n) =>
    [...byRate(n.lines ?? [])].map(([rate, t]) => [n.number, n.noteDate, invoiceNumbers.get(String(n.invoiceId)) ?? '', n.clientGstin ? 'CDNR' : 'CDNUR', n.clientGstin ?? 'Unregistered', rate, ...taxCells(t), n.totalPaise ?? 0]),
  )
}

export async function gstReport(scope: FolioScope, p: ReportParams): Promise<ReportTable> {
  const base = { title: `GST ${GST_SECTION_LABELS[p.section]}`, period: periodLabel(p.from, p.to), empty: EMPTY }
  if (!p.entityId || !Types.ObjectId.isValid(p.entityId)) return { ...base, columns: [col('GST')], rows: [], empty: 'Add a GST-registered firm in Folio settings to prepare a return.' }
  const entityId = new Types.ObjectId(p.entityId)
  if (p.section === 'docs') {
    const rows = await documentsIssued(scope, p, entityId)
    return { ...base, columns: [col('Document'), col('Series'), col('First'), col('Last'), col('Total', 'number'), col('Cancelled', 'number')], rows, empty: 'Nothing issued in this period.' }
  }
  const [invoices, notes] = await Promise.all([loadInvoices(scope, p, entityId), loadCreditNotes(scope, p, entityId)])
  const registered = invoices.filter((i) => !isUnregistered(i) && !isZeroRated(i))
  const unregistered = invoices.filter((i) => isUnregistered(i) && !isZeroRated(i))
  const large = unregistered.filter((i) => i.supplyType === 'inter_state' && (i.totalPaise ?? 0) > B2CL_THRESHOLD_PAISE)
  switch (p.section) {
    case 'b2b':
      return { ...base, columns: [col('GSTIN'), col('Client'), col('Invoice'), col('Date', 'date'), col('Invoice value', 'money'), col('Place of supply'), col('Reverse charge'), col('Rate %', 'number'), ...taxCols], rows: invoiceWise(registered, true) }
    case 'b2cl':
      return { ...base, columns: [col('Client'), col('Invoice'), col('Date', 'date'), col('Invoice value', 'money'), col('Place of supply'), col('Rate %', 'number'), ...taxCols], rows: invoiceWise(large, false), note: 'Inter-state invoices to unregistered buyers above ₹1,00,000. Verify the current threshold before filing.' }
    case 'b2cs':
      return { ...base, columns: [col('Place of supply'), col('Rate %', 'number'), ...taxCols], rows: b2cs(unregistered.filter((i) => !large.includes(i))) }
    case 'exports':
      return {
        ...base,
        columns: [col('Invoice'), col('Date', 'date'), col('Client'), col('Supply'), col('Invoice value', 'money'), col('Taxable', 'money')],
        rows: invoices.filter(isZeroRated).map((i) => [i.number ?? null, i.issueDate, i.billTo?.name ?? '', SUPPLY_TYPE_LABELS[(i.supplyType ?? 'export') as SupplyType], i.totalPaise ?? 0, i.taxablePaise ?? 0]),
      }
    case 'cdn': {
      const numbers = new Map((await scope.db(Invoice).find({ _id: { $in: notes.map((n) => n.invoiceId) } }, { number: 1 }).lean()).map((i) => [String(i._id), i.number ?? '']))
      return { ...base, columns: [col('Credit note'), col('Date', 'date'), col('Against invoice'), col('Type'), col('Client GSTIN'), col('Rate %', 'number'), ...taxCols, col('Total', 'money')], rows: creditNoteRows(notes, numbers), empty: 'No credit notes in this period.' }
    }
    case 'hsn':
      return { ...base, columns: [col('HSN/SAC'), col('Rate %', 'number'), col('Quantity', 'number'), ...taxCols], rows: hsn(invoices) }
    default:
      return { ...base, ...summary(invoices, notes) }
  }
}
