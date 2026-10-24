/**
 * The Extend trial dialog's wording and default (pure, client-safe), from the
 * Console's Sales extension days, so the form never pre-fills a number the
 * server would refuse.
 */

/** Admins may add up to this many days at a time (the server's schema limit). */
export const ADMIN_MAX_EXTENSION_DAYS = 60
const ADMIN_DEFAULT_DAYS = 14

export type ExtendCopy = Readonly<{ description?: string; help: string; defaultDays: string }>

export function extendDialogCopy(opts: Readonly<{ salesOnce: boolean; salesMaxDays: number }>): ExtendCopy {
  const from = 'Counted from today or the current end, whichever is later.'
  if (opts.salesOnce) {
    return { description: `Sales can extend a trial once, by up to ${opts.salesMaxDays} days. Anything more needs an Admin.`, help: `1–${opts.salesMaxDays}. ${from}`, defaultDays: String(opts.salesMaxDays) }
  }
  return { help: `1–${ADMIN_MAX_EXTENSION_DAYS}. ${from}`, defaultDays: String(ADMIN_DEFAULT_DAYS) }
}

/**
 * Extending or ending a running window by account type: a Free account's
 * window is its Free plan (trialEndsAt and freeEndsAt move together, so the
 * lifecycle and the Free-ending emails follow), anything else is a trial.
 */
export type WindowWords = Readonly<{ noun: 'Free plan' | 'trial'; extendLabel: string; endLabel: string; endDescription: string }>

export function windowWords(accountType: string): WindowWords {
  if (accountType === 'free') return { noun: 'Free plan', extendLabel: 'Extend Free plan', endLabel: 'End Free plan now', endDescription: 'The Free plan ends today. The workspace becomes read-only for 30 days, then locked.' }
  return { noun: 'trial', extendLabel: 'Extend trial', endLabel: 'End trial now', endDescription: 'The workspace becomes read-only for 30 days, then locked.' }
}

/** The subscription fields to set when the window moves to `ends`. */
export const windowEndFields = (accountType: string, ends: Date): Record<string, Date> =>
  accountType === 'free' ? { 'subscription.trialEndsAt': ends, 'subscription.freeEndsAt': ends } : { 'subscription.trialEndsAt': ends }
