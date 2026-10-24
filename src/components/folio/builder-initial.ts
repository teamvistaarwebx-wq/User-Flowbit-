import { addDays } from '@/lib/dates'
import type { BuilderOptions } from '@/modules/folio/invoices/builder-data'
import type { SupplyMode } from '@/modules/folio/types'
import type { BuilderInitial } from './InvoiceBuilder'
import { linesFromStored, newLine } from './line-state'

/** Initial builder values for a new document, from URL prefills and the client's billing profile. */

export type Prefill = { clientId?: string; entityId?: string; dealId?: string; title?: string; amountPaise?: number }

export function newDocumentInitial(options: BuilderOptions, prefill: Prefill, date: string): BuilderInitial {
  const client = options.clients.find((c) => c.id === prefill.clientId)
  const entity =
    options.entities.find((e) => e.id === prefill.entityId) ??
    options.entities.find((e) => e.id === client?.defaultEntityId) ??
    options.entities.find((e) => e.isDefault) ??
    options.entities[0]
  const gst = entity?.kind === 'gst' ? (client?.gstRatePercent ?? entity.gstRatePercent) : 0
  const dealLine = prefill.title ? newLine(gst, { description: prefill.title.slice(0, 500), rate: prefill.amountPaise ? (prefill.amountPaise / 100).toFixed(2) : '' }) : null
  return {
    entityId: entity?.id ?? '',
    clientId: client?.id ?? '',
    date,
    paymentTermsDays: String(client?.paymentTermsDays ?? entity?.paymentTermsDays ?? 15),
    validUntil: addDays(date, options.validityDays),
    kind: 'quote',
    subject: prefill.title?.slice(0, 200) ?? '',
    billingType: 'one_time',
    purchaseOrderRef: '',
    bankAccountId: entity?.banks.find((b) => b.isDefault)?.id ?? entity?.banks[0]?.id ?? '',
    placeOfSupplyStateCode: '',
    supplyMode: client?.isExport ? 'export' : 'auto',
    reverseCharge: false,
    periodStart: '',
    periodEnd: '',
    lines: [dealLine ?? newLine(gst)],
    discountType: 'none',
    discountValue: '',
    notes: entity?.notes ?? '',
    terms: entity?.terms ?? '',
    internalNotes: '',
    dealId: prefill.dealId,
  }
}

type StoredDoc = {
  entityId: unknown
  clientId: unknown
  subject?: string | null
  placeOfSupplyStateCode?: string | null
  supplyType: string
  discountType?: string | null
  discountValue: number
  notes?: string | null
  terms?: string | null
  lines: Parameters<typeof linesFromStored>[0]
}

/** Builder values from a stored invoice or quote (edit and duplicate). */
export function storedDocumentInitial(base: BuilderInitial, doc: StoredDoc): BuilderInitial {
  const discountType = doc.discountType === 'percent' || doc.discountType === 'amount' ? doc.discountType : 'none'
  return {
    ...base,
    entityId: String(doc.entityId),
    clientId: String(doc.clientId),
    subject: doc.subject ?? '',
    placeOfSupplyStateCode: doc.placeOfSupplyStateCode ?? '',
    supplyMode: (doc.supplyType === 'export' || doc.supplyType === 'sez' ? doc.supplyType : 'auto') as SupplyMode,
    lines: linesFromStored(doc.lines),
    discountType,
    discountValue: discountType === 'none' ? '' : String(discountType === 'amount' ? doc.discountValue / 100 : doc.discountValue),
    notes: doc.notes ?? '',
    terms: doc.terms ?? '',
  }
}
