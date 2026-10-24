/**
 * Folio's string vocabularies. Mongoose enums are declared from these so the
 * database and the type system cannot drift apart. Client-safe.
 */

export type { DocumentType, SupplyType } from './engine/gst'
export type { DiscountType } from './engine/totals'
export type { RetainerFrequency, SeriesKind } from './engine/numbering'
export type { InvoiceStatus } from './engine/settlement-math'

export const ENTITY_KINDS = ['gst', 'non_gst'] as const
export type EntityKind = (typeof ENTITY_KINDS)[number]

export const DOCUMENT_TYPES = ['tax_invoice', 'sale_invoice'] as const
export const SUPPLY_TYPES = ['intra_state', 'inter_state', 'export', 'sez', 'exempt'] as const
export const SUPPLY_MODES = ['auto', 'export', 'sez'] as const
export type SupplyMode = (typeof SUPPLY_MODES)[number]

export const INVOICE_STATUSES = ['draft', 'issued', 'part_paid', 'paid', 'void'] as const
export const BILLING_TYPES = ['one_time', 'retainer', 'milestone', 'advance', 'opening'] as const
export type BillingType = (typeof BILLING_TYPES)[number]
/** What the builder offers (opening rows come from the billing profile). */
export const BUILDER_BILLING_TYPES = ['one_time', 'retainer', 'milestone', 'advance'] as const
export const DISCOUNT_TYPES = ['percent', 'amount'] as const

export const QUOTE_KINDS = ['quote', 'proforma'] as const
export type QuoteKind = (typeof QUOTE_KINDS)[number]
export const QUOTE_STATUSES = ['draft', 'sent', 'accepted', 'declined', 'converted'] as const
export type QuoteStatus = (typeof QUOTE_STATUSES)[number]

export const CREDIT_NOTE_STATUSES = ['issued', 'cancelled'] as const
export const CREDIT_NOTE_REASONS = ['post_sale_discount', 'deficiency', 'correction', 'cancellation', 'other'] as const
export type CreditNoteReason = (typeof CREDIT_NOTE_REASONS)[number]
export const CREDIT_NOTE_REASON_LABELS: Record<CreditNoteReason, string> = {
  post_sale_discount: 'Post-sale discount',
  deficiency: 'Deficiency in service',
  correction: 'Correction in invoice',
  cancellation: 'Cancellation of supply',
  other: 'Other',
}

export const RETAINER_FREQUENCIES = ['monthly', 'quarterly', 'half_yearly', 'annual'] as const
export const FREQUENCY_LABELS: Record<(typeof RETAINER_FREQUENCIES)[number], string> = { monthly: 'Monthly', quarterly: 'Quarterly', half_yearly: 'Half-yearly', annual: 'Annual' }
export const RETAINER_STATUSES = ['active', 'paused', 'ended'] as const
export const PLAN_STATUSES = ['draft', 'active', 'on_hold', 'completed', 'cancelled'] as const
export const MILESTONE_STATUSES = ['pending', 'invoiced', 'paid', 'cancelled'] as const

export const BILLING_TYPE_LABELS: Record<BillingType, string> = { one_time: 'One-time', retainer: 'Retainer', milestone: 'Milestone', advance: 'Advance', opening: 'Opening balance' }
export const DOC_LABELS = { tax_invoice: 'Tax Invoice', sale_invoice: 'Sale Invoice' } as const

export const DEFAULT_TAX_RATES = [0, 5, 12, 18, 28]
export const DEFAULT_TERMS_DAYS = 15
export const DEFAULT_TDS_SECTION = '194J'
export const DEFAULT_TDS_PERCENT = 10
export const PAGE_SIZE = 25
