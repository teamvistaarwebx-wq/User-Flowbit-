import { daysInMonth } from '../engine/calendar'

/**
 * Expense vocabulary and arithmetic (pure, client-safe). Money is paise.
 * `amountPaise` is what left the bank, GST included; `gstPaise` is the GST
 * inside it. When that GST can be claimed as input tax credit it is not a
 * cost, so the P&L counts amount − GST; otherwise the whole amount.
 */

export const EXPENSE_MODES = ['bank_transfer', 'upi', 'card', 'cheque', 'cash', 'auto_debit', 'other'] as const
export type ExpenseMode = (typeof EXPENSE_MODES)[number]
export const EXPENSE_MODE_LABELS: Record<ExpenseMode, string> = { bank_transfer: 'Bank transfer', upi: 'UPI', card: 'Card', cheque: 'Cheque', cash: 'Cash', auto_debit: 'Auto-debit', other: 'Other' }

export const PAID_FROM = ['bank', 'cash'] as const
export type PaidFrom = (typeof PAID_FROM)[number]
export const PAID_FROM_LABELS: Record<PaidFrom, string> = { bank: 'Bank', cash: 'Cash' }

/** Seeded into every workspace's category list the first time it is read. */
export const DEFAULT_EXPENSE_CATEGORIES = [
  'Rent',
  'Salaries & wages',
  'Software & subscriptions',
  'Travel',
  'Marketing',
  'Creator/freelancer payments',
  'Office & utilities',
  'Professional fees',
  'Bank charges',
  'Taxes & fees',
  'Other',
] as const

export type ExpenseMoney = { amountPaise: number; gstPaise?: number | null; itcEligible?: boolean | null }

/** What the expense costs the business: GST claimable as input tax is left out. */
export const netCostPaise = (e: ExpenseMoney): number => e.amountPaise - (e.itcEligible ? (e.gstPaise ?? 0) : 0)

/** Input tax credit the expense carries (0 when not claimable). */
export const inputTaxPaise = (e: ExpenseMoney): number => (e.itcEligible ? (e.gstPaise ?? 0) : 0)

/** The first problem with the amounts, or null. */
export function expenseAmountIssue(e: ExpenseMoney): string | null {
  if (!Number.isInteger(e.amountPaise) || e.amountPaise <= 0) return 'Enter the amount paid.'
  const gst = e.gstPaise ?? 0
  if (!Number.isInteger(gst) || gst < 0) return 'GST must be zero or more.'
  if (gst >= e.amountPaise) return 'The GST must be less than the amount paid.'
  return null
}

/** The same day next month, clamped (31 Jan → 28 Feb). `day` keeps the original day across a short month (28 Feb → 31 Mar). */
export function nextMonthSameDay(date: string, day?: number | null): string {
  const [y, m, d] = date.split('-').map(Number)
  const year = m === 12 ? y + 1 : y
  const month = m === 12 ? 1 : m + 1
  return `${year}-${String(month).padStart(2, '0')}-${String(Math.min(day ?? d, daysInMonth(year, month))).padStart(2, '0')}`
}

/** The day of the month a repeating expense falls on: its stored repeat day, else its own date's day. */
export const repeatDayOf = (e: { date: string; repeatDay?: number | null }): number => e.repeatDay ?? Number(e.date.slice(8, 10))

/**
 * Where a copy forward lands: next month on the repeat day, but never after
 * today, because an expense is booked as paid. Null while that month has not
 * started yet.
 */
export function copyForwardDate(e: { date: string; repeatDay?: number | null }, today: string): string | null {
  const target = nextMonthSameDay(e.date, repeatDayOf(e))
  if (target.slice(0, 7) > today.slice(0, 7)) return null
  return target > today ? today : target
}
