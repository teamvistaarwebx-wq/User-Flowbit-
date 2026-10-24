import type { AccountType } from '@/lib/account-types'
import { addDays, daysBetween } from '@/lib/dates'
import { PAST_DUE_GRACE_DAYS } from '@/lib/plans'

/**
 * The rules of Flowbit's own billing (console spec 11), pure and client-safe:
 * TDS settlement, offline payments (maker-checker, UTR, provisional access),
 * credit notes and refunds, the reminder schedule and the autopay notices.
 */

const DAY_MS = 86_400_000
const HOUR_MS = 3_600_000

// ---------------------------------------------------------------------------
// TDS (s.393(1) Income-tax Act 2025, ex-194J): business customers deduct 2%
// ---------------------------------------------------------------------------

export const TDS_RATE_PERCENT = 2
/** Settled when at least this share of the total arrived and TDS was declared. */
export const TDS_SETTLE_PERCENT = 98

/** 2% of the taxable value (TDS is not deducted on the GST shown separately). */
export const expectedTdsPaise = (taxablePaise: number): number => Math.round((taxablePaise * TDS_RATE_PERCENT) / 100)

export type SettlementStatus = 'paid' | 'paid_with_tds' | 'short'
export type Settlement = Readonly<{ status: SettlementStatus; tdsPaise: number; shortPaise: number }>

/**
 * Whether money received settles a bill: in full, or at least 98% with TDS
 * declared (the rest is the customer's TDS, tracked until the certificate
 * arrives). Anything less is short and the bill stays due.
 */
export function settlementOf(input: { totalPaise: number; receivedPaise: number; tdsDeclared: boolean }): Settlement {
  const { totalPaise, receivedPaise } = input
  if (receivedPaise >= totalPaise) return { status: 'paid', tdsPaise: 0, shortPaise: 0 }
  if (input.tdsDeclared && receivedPaise * 100 >= totalPaise * TDS_SETTLE_PERCENT) return { status: 'paid_with_tds', tdsPaise: totalPaise - receivedPaise, shortPaise: 0 }
  return { status: 'short', tdsPaise: 0, shortPaise: totalPaise - receivedPaise }
}

/** What the customer pays online for a bill: the total, less 2% of the taxable value when they deduct TDS. */
export const payableNowPaise = (bill: { totalPaise: number; taxableValuePaise: number; tdsDeclared: boolean }): number =>
  bill.tdsDeclared ? bill.totalPaise - expectedTdsPaise(bill.taxableValuePaise) : bill.totalPaise

export const TDS_CERT_LABEL = { awaited: 'Certificate awaited', received: 'Certificate received', matched_26as: 'Matched in 26AS', mismatch: 'Mismatch with 26AS' } as const

// ---------------------------------------------------------------------------
// Offline payments: UTR + amount + screenshot, never activated on a screenshot alone
// ---------------------------------------------------------------------------

export const PROVISIONAL_DAYS = 7
export const OFFLINE_MODES = ['upi', 'neft', 'rtgs', 'imps', 'cheque', 'other'] as const
export type OfflineMode = (typeof OFFLINE_MODES)[number]
export const OFFLINE_MODE_LABEL: Record<OfflineMode, string> = { upi: 'UPI', neft: 'NEFT', rtgs: 'RTGS', imps: 'IMPS', cheque: 'Cheque', other: 'Other' }

/** Bank references compare without spaces, dashes or case. */
export const normalizeUtr = (raw: string): string => raw.replace(/[\s-]/g, '').toUpperCase()

/** UPI/IMPS references are 12 digits, NEFT/RTGS 16–22 characters; cheques carry 6 digits. */
export const isValidUtr = (raw: string): boolean => /^[A-Z0-9]{6,22}$/.test(normalizeUtr(raw))

export const provisionalUntil = (recordedAt: Date): Date => new Date(recordedAt.getTime() + PROVISIONAL_DAYS * DAY_MS)

export type OfflineStatus = 'pending' | 'verified' | 'rejected' | 'expired'

/** A pending payment past its 7 days without verification: provisional access ends. */
export const isProvisionalExpired = (payment: { status: OfflineStatus; provisionalUntil: Date }, now: Date): boolean =>
  payment.status === 'pending' && payment.provisionalUntil.getTime() <= now.getTime()

/**
 * Maker-checker: who may verify (or reject) an offline payment. The staff
 * member who recorded it never may; a payment the customer submitted may be
 * checked by any Accounts staff.
 */
export function verifyRefusal(input: { status: OfflineStatus; recordedByStaffId?: string | null; verifierStaffId: string }): string | null {
  if (input.status === 'verified') return 'This payment is already verified.'
  if (input.status === 'rejected') return 'This payment was rejected. Record it again if it was a mistake.'
  if (input.recordedByStaffId && input.recordedByStaffId === input.verifierStaffId) return 'You recorded this payment, so someone else must verify it against the bank statement.'
  return null
}

// ---------------------------------------------------------------------------
// Credit notes and refunds
// ---------------------------------------------------------------------------

export const CREDIT_REASONS = ['billing_error', 'duplicate_payment', 'downgrade', 'cancellation', 'goodwill'] as const
export type CreditReason = (typeof CREDIT_REASONS)[number]
export const CREDIT_REASON_LABEL: Record<CreditReason, string> = {
  billing_error: 'Billing error',
  duplicate_payment: 'Duplicate payment',
  downgrade: 'Downgrade',
  cancellation: 'Cancellation',
  goodwill: 'Goodwill',
}
/** Yearly plans get no refund except for these (money that was never owed). */
const YEARLY_REFUNDABLE: ReadonlySet<CreditReason> = new Set(['billing_error', 'duplicate_payment'])

export function creditNoteRefusal(input: { invoiceStatus: string; totalPaise: number; creditedPaise: number; amountPaise: number; kind?: string | null }): string | null {
  if (input.invoiceStatus !== 'paid') return 'A credit note needs a paid tax invoice.'
  // Wallet credit has no cash-out: crediting or refunding its recharge invoice would leave the credit in the wallet (V2-REVIEW M-H2).
  if (input.kind === 'wallet_recharge') return 'A wallet recharge cannot be credited or refunded: the credit is already in the wallet.'
  if (!Number.isInteger(input.amountPaise) || input.amountPaise <= 0) return 'Enter an amount above zero.'
  if (input.amountPaise > input.totalPaise - input.creditedPaise) return 'That is more than is left to credit on this invoice.'
  return null
}

/**
 * Refunds go only to the original Razorpay payment. Monthly downgrades apply
 * from the next cycle (no refund); yearly plans are not refunded except money
 * that was never owed (a billing error or a duplicate payment).
 */
export function refundRefusal(input: { provider: string | null | undefined; paymentId: string | null | undefined; cycle: string | null | undefined; reason: CreditReason; amountPaise: number; paidPaise: number; refundedPaise: number }): string | null {
  if (input.provider !== 'razorpay' || !input.paymentId) return 'Refunds go only to the original Razorpay payment. This invoice was paid another way, so settle it outside Flowbit.'
  if (input.reason === 'downgrade') return 'A downgrade applies from the next cycle; nothing is refunded.'
  if (input.cycle === 'yearly' && !YEARLY_REFUNDABLE.has(input.reason)) return 'Yearly plans are not refunded, except a billing error or a duplicate payment.'
  if (!Number.isInteger(input.amountPaise) || input.amountPaise <= 0) return 'Enter an amount above zero.'
  if (input.amountPaise > input.paidPaise - input.refundedPaise) return 'That is more than was paid and not yet refunded.'
  return null
}

/** Failed autopay keeps full access this long after the first failed charge. */
export const autopayGraceEnds = (failedAt: Date): Date => new Date(failedAt.getTime() + PAST_DUE_GRACE_DAYS * DAY_MS)

// ---------------------------------------------------------------------------
// Renewal and dunning reminders
// ---------------------------------------------------------------------------

/** Days relative to the due or end date: 15, 7, 3, 1 before; the day; 1, 3, 7 after. */
export const DUNNING_OFFSETS = [-15, -7, -3, -1, 0, 1, 3, 7] as const
export type DunningOffset = (typeof DUNNING_OFFSETS)[number]

/** Internal, Test and Comped workspaces are never reminded. */
const NEVER_REMINDED: ReadonlySet<AccountType> = new Set(['internal', 'test', 'comped'])
export const isDunningExcluded = (type: AccountType): boolean => NEVER_REMINDED.has(type)

/** The reminder due today for something due on `dueDate` (both 'YYYY-MM-DD', IST), or null. */
export function dunningOffset(dueDate: string, today: string): DunningOffset | null {
  const offset = daysBetween(dueDate, today)
  return (DUNNING_OFFSETS as readonly number[]).includes(offset) ? (offset as DunningOffset) : null
}

export type RenewalNotice = 'renews' | 'expires' | 'expired' | 'overdue'

/**
 * The renewal reminder for a paid plan ending on its period end: before the
 * end, "renews" (autopay on) or "expires"; on and after it, nothing when
 * autopay took the money (the period moved), "overdue" while unpaid.
 */
export function renewalNotice(input: { offset: DunningOffset; autopayActive: boolean; paidThrough: boolean }): RenewalNotice | null {
  if (input.offset < 0) return input.autopayActive ? 'renews' : 'expires'
  if (input.paidThrough) return null
  return input.offset === 0 ? 'expired' : 'overdue'
}

/** The 'YYYY-MM-DD' a reminder offset falls on (the schedule shown in the Console). */
export const reminderDates = (dueDate: string): string[] => DUNNING_OFFSETS.map((o) => addDays(dueDate, o))

// ---------------------------------------------------------------------------
// Autopay notices (RBI e-mandate framework)
// ---------------------------------------------------------------------------

/** RBI: a pre-debit notice at least 24 hours before each charge. */
export const PRE_DEBIT_MIN_HOURS = 24
/** The daily job sends it in the 24 hours before that limit, so it always lands once. */
export const PRE_DEBIT_WINDOW_HOURS = 48

export function preDebitNoticeDue(chargeAt: Date, now: Date): boolean {
  const ahead = chargeAt.getTime() - now.getTime()
  return ahead > PRE_DEBIT_MIN_HOURS * HOUR_MS && ahead <= PRE_DEBIT_WINDOW_HOURS * HOUR_MS
}

/** Debits above ₹15,000 need the customer's approval each time (no AFA exemption). */
export const AFA_LIMIT_PAISE = 1_500_000

/** The ₹15,000 note goes on yearly plans whose debit is above the limit. */
export const needsPerDebitApproval = (input: { amountPaise: number; cycle: string | null | undefined }): boolean => input.cycle === 'yearly' && input.amountPaise > AFA_LIMIT_PAISE

/** Paise received on a bill beyond its total (0 when not overpaid); Accounts refunds or credits it (V2-REVIEW M-M3). */
export const overpaidBy = (totalPaise: number, receivedBeforePaise: number, amountPaise: number): number => Math.max(0, receivedBeforePaise + amountPaise - totalPaise)

/**
 * The instant a bill's tax invoice is dated: the Razorpay payment time, but
 * for an offline payment the day Accounts verifies it, never the date the
 * customer typed (which could fall in a closed FY or the future; V2-REVIEW M-L3).
 */
export const taxInvoiceInstant = (money: { provider: string; paidAt: Date }, now: Date): Date => (money.provider === 'offline' ? now : money.paidAt)

/** The duplicate-key error of the "one due bill per workspace" index (V2-REVIEW M-L5), not of another unique field. */
export function isSecondDueBill(error: unknown): boolean {
  const e = error as { code?: number; keyPattern?: Record<string, unknown>; message?: string } | null
  if (e?.code !== 11000) return false
  if (e.keyPattern) return Object.keys(e.keyPattern).length === 1 && 'orgId' in e.keyPattern
  return /one_due_bill_per_org/.test(e.message ?? '')
}

export type BalanceBill = Readonly<{ totalPaise: number; taxableValuePaise: number; receivedPaise?: number | null; tds?: { declared?: boolean | null } | null }>

/**
 * What is still to pay on a due bill: the payable amount (the total, less 2%
 * of the taxable value with TDS declared) minus what has arrived. The link,
 * reminders, the public page and Settings → Plan & billing all show this.
 */
export const billBalancePaise = (bill: BalanceBill): number =>
  Math.max(0, payableNowPaise({ totalPaise: bill.totalPaise, taxableValuePaise: bill.taxableValuePaise, tdsDeclared: Boolean(bill.tds?.declared) }) - (bill.receivedPaise ?? 0))
