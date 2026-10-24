import type { QuoteStatus } from '../types'

/** Pure quote rules, unit tested in rules.test.ts. */

/** Statuses a quote can be converted from, and so return to when its invoice is deleted or voided. */
export const CONVERTIBLE_STATUSES = ['draft', 'sent', 'accepted'] as const satisfies readonly QuoteStatus[]

type ReleasedQuote = { statusBeforeConvert?: string | null; acceptedAt?: Date | null; sentAt?: Date | null }

/**
 * The status a converted quote goes back to when its invoice is deleted or
 * voided: the one it had before conversion. Quotes converted before that was
 * recorded fall back on their timestamps.
 */
export function statusAfterRelease(quote: ReleasedQuote): QuoteStatus {
  const before = CONVERTIBLE_STATUSES.find((s) => s === quote.statusBeforeConvert)
  if (before) return before
  if (quote.acceptedAt) return 'accepted'
  return quote.sentAt ? 'sent' : 'draft'
}

/** Statuses whose figures can still change. Once a client has accepted or declined, the record stays as they saw it. */
export const EDITABLE_STATUSES = ['draft', 'sent'] as const satisfies readonly QuoteStatus[]

export const isQuoteEditable = (status: string): boolean => (EDITABLE_STATUSES as readonly string[]).includes(status)

/** Why a quote in this status cannot be edited, or null when it can. */
export function quoteEditRefusal(status: string): string | null {
  if (isQuoteEditable(status)) return null
  if (status === 'converted') return 'This quote is already converted to an invoice, so it can no longer change.'
  return `This quote is ${status}, so its figures stay as the client saw them. Duplicate it to quote new figures.`
}
