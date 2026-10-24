import { isoDateIST } from '@/lib/dates'
import type { WaCategory } from '@/modules/whatsapp/templates'

/**
 * The WhatsApp wallet (notifications-v2 §0b.8, §2.3; V2-PLAN §7), pure and
 * client-safe. All money is integer paise. A wallet has two balances:
 * promo (free credit, no GST, spent first) and paid (recharges, GST
 * invoiced, expire 12 months after each recharge). Credit is usable only for
 * Flowbit messages: no cash-out and no transfer between workspaces (RBI
 * closed-system PPI).
 */

// ---------------------------------------------------------------------------
// Packs, bonus, limits
// ---------------------------------------------------------------------------

export type Pack = Readonly<{ paise: number; bonusPercent: number }>

/** ₹500, ₹1,000, ₹2,500 (+5%), ₹5,000 (+10%), ₹10,000 (+12%), ex-GST. */
export const PACKS: readonly Pack[] = [
  { paise: 50_000, bonusPercent: 0 },
  { paise: 100_000, bonusPercent: 0 },
  { paise: 250_000, bonusPercent: 5 },
  { paise: 500_000, bonusPercent: 10 },
  { paise: 1_000_000, bonusPercent: 12 },
]
export const MIN_RECHARGE_PAISE = 50_000
/** A ceiling on one recharge (a typo guard; larger amounts in several recharges). */
export const MAX_RECHARGE_PAISE = 10_000_000
/** Auto top-up suggestion (V2-PLAN §7): below ₹200. */
export const DEFAULT_AUTO_TOP_UP_BELOW_PAISE = 20_000
export const PAID_CREDIT_EXPIRY_MONTHS = 12
export const GST_PERCENT = 18

/** Bonus credit for a recharge: the bonus of the largest pack at or below the amount (custom amounts too). */
export function bonusFor(amountPaise: number, packs: readonly Pack[] = PACKS): number {
  const pack = [...packs].filter((p) => p.paise <= amountPaise).sort((a, b) => b.paise - a.paise)[0]
  return pack ? Math.floor((amountPaise * pack.bonusPercent) / 100) : 0
}

/** Why a recharge amount is refused, or null. Whole rupees only. */
export function rechargeRefusal(amountPaise: number): string | null {
  if (!Number.isInteger(amountPaise) || amountPaise % 100 !== 0) return 'Enter a whole number of rupees.'
  if (amountPaise < MIN_RECHARGE_PAISE) return 'The smallest recharge is ₹500.'
  if (amountPaise > MAX_RECHARGE_PAISE) return 'The largest single recharge is ₹1,00,000. Recharge again for more.'
  return null
}

export type RechargeQuote = Readonly<{ creditPaise: number; bonusPaise: number; gstPaise: number; payablePaise: number }>

/**
 * What a recharge costs and gives: the credit, its free bonus, 18% GST on the
 * credit only, the total rounded to the rupee as the tax invoice rounds it
 * (lib/billing subscriptionInvoiceTotals), so the payment link and the
 * invoice always agree. `chargeGst` is false while Flowbit has no GSTIN
 * (lib/billing chargesGst, owner decision D8): no GST then.
 */
export function rechargeQuote(amountPaise: number, chargeGst: boolean): RechargeQuote {
  const gstPaise = chargeGst ? Math.round((amountPaise * GST_PERCENT) / 100) : 0
  return { creditPaise: amountPaise, bonusPaise: bonusFor(amountPaise), gstPaise, payablePaise: Math.round((amountPaise + gstPaise) / 100) * 100 }
}

/** When paid credit bought at `at` expires: the same calendar day 12 months later. */
export function paidExpiryFrom(at: Date, months = PAID_CREDIT_EXPIRY_MONTHS): Date {
  const out = new Date(at.getTime())
  out.setUTCMonth(out.getUTCMonth() + months)
  return out
}

// ---------------------------------------------------------------------------
// Prices and the free allowance
// ---------------------------------------------------------------------------

export const WALLET_MODES = ['byo', 'managed'] as const
export type WalletMode = (typeof WALLET_MODES)[number]

export const ALLOWANCE_TIERS = ['free', 'trial', 'custom', 'suite'] as const
export type AllowanceTier = (typeof ALLOWANCE_TIERS)[number]

export type WalletSettings = Readonly<{
  /** Flowbit's price per message (paise, ex-GST) by category: what managed mode charges. */
  rates: Readonly<Record<WaCategory, number>>
  /** The platform fee per message in "bring your own Interakt" mode (Interakt bills the workspace for Meta). */
  byoFeePaise: number
  /** Free messages a month per plan (unused ones do not carry over). */
  allowance: Readonly<Record<AllowanceTier, number>>
  /** A low-balance alert below this. */
  lowBalancePaise: number
}>

export const DEFAULT_WALLET_SETTINGS: WalletSettings = {
  rates: { utility: 25, authentication: 20, service: 20, marketing: 125 },
  byoFeePaise: 0,
  allowance: { free: 0, trial: 0, custom: 300, suite: 1000 },
  lowBalancePaise: DEFAULT_AUTO_TOP_UP_BELOW_PAISE,
}

const wholePaise = (value: unknown, fallback: number, max: number): number => (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= max ? value : fallback)

export function mergeWalletSettings(stored: unknown): WalletSettings {
  const s = (stored && typeof stored === 'object' ? stored : {}) as Partial<Record<keyof WalletSettings, unknown>>
  const rates = (s.rates ?? {}) as Record<string, unknown>
  const allowance = (s.allowance ?? {}) as Record<string, unknown>
  const base = DEFAULT_WALLET_SETTINGS
  return {
    rates: Object.fromEntries(Object.entries(base.rates).map(([k, v]) => [k, wholePaise(rates[k], v, 10_000)])) as Record<WaCategory, number>,
    byoFeePaise: wholePaise(s.byoFeePaise, base.byoFeePaise, 10_000),
    allowance: Object.fromEntries(ALLOWANCE_TIERS.map((t) => [t, wholePaise(allowance[t], base.allowance[t], 1_000_000)])) as Record<AllowanceTier, number>,
    lowBalancePaise: wholePaise(s.lowBalancePaise, base.lowBalancePaise, 100_000_000),
  }
}

/** What one message costs the wallet: the BYO platform fee, or the managed rate card. */
export const messagePricePaise = (mode: WalletMode, category: WaCategory, settings: WalletSettings): number => (mode === 'byo' ? settings.byoFeePaise : settings.rates[category])

/** Most free messages a month an Admin can give one workspace (a typo guard). */
export const MAX_ALLOWANCE_OVERRIDE = 100_000

/**
 * Free messages a month for a workspace: the Admin's per-workspace override
 * when set (0 is a real value: no free messages), else its plan's row of the
 * Console allowance.
 */
export function allowanceFor(sub: { accountType?: string | null; plan?: string | null } | null | undefined, settings: Pick<WalletSettings, 'allowance'>, override: number | null | undefined): number {
  if (typeof override === 'number' && Number.isInteger(override) && override >= 0) return Math.min(override, MAX_ALLOWANCE_OVERRIDE)
  return settings.allowance[allowanceTier(sub)]
}

/** The allowance row a workspace reads: Free and Trial by account type, else its plan. */
export function allowanceTier(sub: { accountType?: string | null; plan?: string | null } | null | undefined): AllowanceTier {
  if (sub?.accountType === 'free') return 'free'
  if (sub?.plan === 'suite') return 'suite'
  if (!sub?.plan || sub.plan === 'trial' || sub.accountType === 'trial') return 'trial'
  return 'custom'
}

// ---------------------------------------------------------------------------
// Balances: debit (promo first), caps, refunds
// ---------------------------------------------------------------------------

export type WalletState = Readonly<{
  paidPaise: number
  promoPaise: number
  /** Spend counted against the caps, per IST day and month. */
  spent: Readonly<{ day: string | null; dayPaise: number; month: string | null; monthPaise: number }>
  /** 0 = no cap. */
  caps: Readonly<{ dailyPaise: number; monthlyPaise: number }>
  /** Free messages used this month. */
  free: Readonly<{ month: string | null; used: number }>
}>

export const EMPTY_WALLET: WalletState = { paidPaise: 0, promoPaise: 0, spent: { day: null, dayPaise: 0, month: null, monthPaise: 0 }, caps: { dailyPaise: 0, monthlyPaise: 0 }, free: { month: null, used: 0 } }

export const dayKey = (now: Date): string => isoDateIST(now)
export const monthKey = (now: Date): string => isoDateIST(now).slice(0, 7)

export const balanceOf = (w: Pick<WalletState, 'paidPaise' | 'promoPaise'>): number => w.paidPaise + w.promoPaise

export type DebitRefusal = 'insufficient' | 'daily_cap' | 'monthly_cap'
export type DebitResult = Readonly<{ ok: true; next: WalletState; fromPromo: number; fromPaid: number }> | Readonly<{ ok: false; reason: DebitRefusal }>

/** Spend so far today and this month (a new day or month starts at 0). */
export function spentNow(w: WalletState, now: Date): { day: number; month: number } {
  return { day: w.spent.day === dayKey(now) ? w.spent.dayPaise : 0, month: w.spent.month === monthKey(now) ? w.spent.monthPaise : 0 }
}

/**
 * One message's charge: refused when the balance is short or a cap would be
 * passed; otherwise promo first, then paid. The Mongo store applies the same
 * rule atomically (one guarded update), so concurrent sends never overdraw.
 */
export function applyDebit(w: WalletState, costPaise: number, now: Date): DebitResult {
  if (!Number.isInteger(costPaise) || costPaise <= 0) throw new Error('A debit must be a positive whole number of paise.')
  const spent = spentNow(w, now)
  if (balanceOf(w) < costPaise) return { ok: false, reason: 'insufficient' }
  if (w.caps.dailyPaise > 0 && spent.day + costPaise > w.caps.dailyPaise) return { ok: false, reason: 'daily_cap' }
  if (w.caps.monthlyPaise > 0 && spent.month + costPaise > w.caps.monthlyPaise) return { ok: false, reason: 'monthly_cap' }
  const fromPromo = Math.min(w.promoPaise, costPaise)
  const fromPaid = costPaise - fromPromo
  return {
    ok: true,
    fromPromo,
    fromPaid,
    next: { ...w, promoPaise: w.promoPaise - fromPromo, paidPaise: w.paidPaise - fromPaid, spent: { day: dayKey(now), dayPaise: spent.day + costPaise, month: monthKey(now), monthPaise: spent.month + costPaise } },
  }
}

/** A failed send's money back to the buckets it came from, and off the caps. */
export function applyRefund(w: WalletState, refund: { fromPromo: number; fromPaid: number; at: Date }, now: Date): WalletState {
  const total = refund.fromPromo + refund.fromPaid
  const sameDay = w.spent.day === dayKey(refund.at) && dayKey(refund.at) === dayKey(now)
  const sameMonth = w.spent.month === monthKey(refund.at) && monthKey(refund.at) === monthKey(now)
  return {
    ...w,
    promoPaise: w.promoPaise + refund.fromPromo,
    paidPaise: w.paidPaise + refund.fromPaid,
    spent: { ...w.spent, dayPaise: sameDay ? Math.max(0, w.spent.dayPaise - total) : w.spent.dayPaise, monthPaise: sameMonth ? Math.max(0, w.spent.monthPaise - total) : w.spent.monthPaise },
  }
}

/** Takes one free message of this month's allowance, or null when it is used up. */
export function takeFreeMessage(w: WalletState, allowance: number, now: Date): WalletState | null {
  const month = monthKey(now)
  const used = w.free.month === month ? w.free.used : 0
  if (used >= allowance) return null
  return { ...w, free: { month, used: used + 1 } }
}

export const freeLeft = (w: WalletState, allowance: number, now: Date): number => Math.max(0, allowance - (w.free.month === monthKey(now) ? w.free.used : 0))

// ---------------------------------------------------------------------------
// Expiry: paid credit 12 months after each recharge, oldest spent first
// ---------------------------------------------------------------------------

export type CreditLot = Readonly<{ id: string; creditPaise: number; at: Date; expiresAt: Date }>

/**
 * How much of `lot` is still unspent and expires now. Paid credit is spent
 * oldest first, so the paid balance is made of the newest recharges: what is
 * left of this lot is the balance beyond the newer lots that have not
 * expired, at most the lot itself.
 */
export function expiringPaise(lot: CreditLot, paidBalance: number, newerLots: readonly CreditLot[]): number {
  const newer = newerLots.filter((l) => l.at.getTime() > lot.at.getTime()).reduce((sum, l) => sum + l.creditPaise, 0)
  return Math.max(0, Math.min(lot.creditPaise, paidBalance - newer))
}

// ---------------------------------------------------------------------------
// Alerts and the hold
// ---------------------------------------------------------------------------

export type WalletAlert = 'low' | 'zero'

/** The alert a balance change crosses into (sent once until the next recharge). */
export function alertFor(before: number, after: number, lowBalancePaise: number, minPricePaise: number): WalletAlert | null {
  const empty = (b: number) => b <= 0 || (minPricePaise > 0 && b < minPricePaise)
  if (empty(after) && !empty(before)) return 'zero'
  if (lowBalancePaise > 0 && after < lowBalancePaise && before >= lowBalancePaise && !empty(after)) return 'low'
  return null
}

export const REFUSAL_TEXT: Readonly<Record<DebitRefusal, string>> = {
  insufficient: 'The WhatsApp wallet is empty. Recharge it in Settings → Plan & billing → WhatsApp wallet.',
  daily_cap: "Today's WhatsApp spend cap is reached. Raise it in Settings → Plan & billing → WhatsApp wallet.",
  monthly_cap: "This month's WhatsApp spend cap is reached. Raise it in Settings → Plan & billing → WhatsApp wallet.",
}
