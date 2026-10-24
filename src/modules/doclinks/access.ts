import type { DocKind } from './token'

/**
 * What a client may see and do on a public document page (pure). A link
 * opens only the one document it was made for, in the workspace that made
 * it; these rules decide what that document allows.
 */

export type PublicDocState = Readonly<{ kind: DocKind; status: string; billingType?: string | null }>

/** Drafts are not documents yet; an opening balance row has nothing to show. A voided invoice stays visible, marked void. */
export function isPubliclyVisible(doc: PublicDocState): boolean {
  if (doc.kind === 'invoice') return doc.status !== 'draft' && doc.billingType !== 'opening'
  if (doc.kind === 'credit_note') return doc.status !== 'draft'
  return true
}

export type QuoteForDecision = Readonly<{ status: string; validUntil: string }>

export type QuoteDecision = Readonly<{ open: true } | { open: false; reason: string }>

/** A quote can be accepted or declined while it is a draft or sent and not past its validity. */
export function quoteDecision(quote: QuoteForDecision, today: string): QuoteDecision {
  if (quote.status === 'accepted' || quote.status === 'converted') return { open: false, reason: 'This quote has been accepted.' }
  if (quote.status === 'declined') return { open: false, reason: 'This quote was declined.' }
  if (quote.validUntil < today) return { open: false, reason: 'This quote has expired. Ask for a fresh one.' }
  return { open: true }
}

export type InvoiceForPayment = Readonly<{ status: string; balancePaise: number }>

/** An invoice takes a payment (Pay now, UPI, "I've paid") while it is issued or part paid with money owed. */
export const isPayable = (invoice: InvoiceForPayment): boolean => (invoice.status === 'issued' || invoice.status === 'part_paid') && invoice.balancePaise > 0

/** UTR / UPI reference: 6–30 letters and digits (bank UTRs are 12–22; UPI refs 12). */
export const UTR_PATTERN = /^[A-Za-z0-9]{6,30}$/

export const normalizeUtr = (value: string): string => value.replace(/[\s-]/g, '').toUpperCase()

export type LinkOrgState = Readonly<{ disabled?: boolean | null; deletedAt?: Date | null; status?: string | null }>

/** A workspace that is disabled, deleted or gone serves no public documents: its links read as missing. */
export const orgServesLinks = (org: LinkOrgState | null): boolean => Boolean(org) && !org?.disabled && !org?.deletedAt && org?.status !== 'deleted'
