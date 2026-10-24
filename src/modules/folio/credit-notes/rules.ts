import type { IsoDate } from '../engine/calendar'
import { financialYearOf, financialYearRange } from '../engine/numbering'
import type { ComputedInvoice } from '../engine/totals'

/** Pure credit-note rules, shared by the form preview and the service. */

/** A full credit may move the round-off by less than a rupee to land on the outstanding amount. */
const MAX_ROUND_OFF_GAP_PAISE = 100

/**
 * In full mode, sets the round-off so the note's total equals what is
 * outstanding, when the two differ only by rounding (R3 L-25a). Without this a
 * ₹1,180 invoice could not be fully credited after a small earlier note, or
 * would strand ₹1.
 */
export function fitFullCredit<T extends Pick<ComputedInvoice, 'roundOff' | 'total'>>(priced: T, outstandingPaise: number): T {
  const beforeRounding = priced.total - priced.roundOff
  const gap = outstandingPaise - beforeRounding
  if (gap === priced.roundOff || Math.abs(gap) >= MAX_ROUND_OFF_GAP_PAISE) return priced
  return { ...priced, roundOff: gap, total: outstandingPaise }
}

/**
 * Whether a credit note against this invoice rounds its total to the rupee:
 * the invoice's own choice, not today's setting. An invoice with a round-off
 * was rounded; one with paise in its total was not; a whole-rupee total with
 * no round-off could be either, so the current setting decides.
 */
export function creditRoundsTotal(invoice: { totalPaise: number; roundOffPaise?: number | null }, settingRounds: boolean): boolean {
  if (invoice.roundOffPaise) return true
  if (invoice.totalPaise % 100 !== 0) return false
  return settingRounds
}

const SEC_34_MONTH_DAY = '11-30'

/**
 * CGST Act Sec 34(2): a credit note's GST can be declared no later than
 * 30 November after the end of the financial year of the supply (or the
 * annual return, if filed earlier).
 */
export function section34Deadline(invoiceDate: IsoDate): IsoDate {
  const { end } = financialYearRange(financialYearOf(invoiceDate))
  return `${end.slice(0, 4)}-${SEC_34_MONTH_DAY}`
}

/** A plain-words warning when the note is dated after the Sec 34 deadline, or null. */
export function section34Warning(invoiceDate: IsoDate, noteDate: IsoDate, format: (iso: string) => string = (iso) => iso): string | null {
  const deadline = section34Deadline(invoiceDate)
  if (noteDate <= deadline) return null
  return `The GST on this invoice could be reduced by a credit note only until ${format(deadline)} (CGST Act Sec 34), or the annual return date if earlier. The note will reduce what the client owes, but the tax cannot be adjusted in GSTR-1. Check with your CA.`
}
