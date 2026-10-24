/**
 * Autopay (Razorpay Subscriptions with UPI Autopay / e-mandate) as a state
 * machine, pure. The webhook feeds Razorpay's subscription events in; the
 * answer is the next state and what it means for the workspace:
 *   renew → a charge went through, roll the period (issue the invoice);
 *   grace → a charge failed, Razorpay retries, 7 days of full access;
 *   lock  → Razorpay stopped retrying: the grace ends as planned, then read-only;
 *   stop  → the mandate is gone; the paid period runs out, reminders take over.
 * Events that make no sense in the current state (a late 'authenticated'
 * after 'active', anything after 'cancelled') are ignored.
 */

export const AUTOPAY_STATUSES = ['created', 'authenticated', 'active', 'pending', 'halted', 'cancelled', 'completed'] as const
export type AutopayStatus = (typeof AUTOPAY_STATUSES)[number]

export const AUTOPAY_EVENTS = [
  'subscription.authenticated',
  'subscription.activated',
  'subscription.charged',
  'subscription.pending',
  'subscription.halted',
  'subscription.resumed',
  'subscription.cancelled',
  'subscription.completed',
] as const
export type AutopayEvent = (typeof AUTOPAY_EVENTS)[number]

export type AutopayEffect = 'none' | 'renew' | 'grace' | 'lock' | 'stop'
export type AutopayStep = Readonly<{ status: AutopayStatus; effect: AutopayEffect }>

export const AUTOPAY_LABEL: Record<AutopayStatus, string> = {
  created: 'Waiting for the customer to approve the mandate',
  authenticated: 'Mandate approved; first debit at renewal',
  active: 'Active',
  pending: 'Last debit failed; Razorpay is retrying',
  halted: 'Stopped after failed retries',
  cancelled: 'Cancelled',
  completed: 'Completed',
}

const EFFECT: Readonly<Partial<Record<AutopayEvent, AutopayEffect>>> = {
  'subscription.charged': 'renew',
  'subscription.pending': 'grace',
  'subscription.halted': 'lock',
  'subscription.cancelled': 'stop',
  'subscription.completed': 'stop',
}

const TRANSITIONS: Readonly<Record<AutopayStatus, Readonly<Partial<Record<AutopayEvent, AutopayStatus>>>>> = {
  created: { 'subscription.authenticated': 'authenticated', 'subscription.activated': 'active', 'subscription.charged': 'active', 'subscription.cancelled': 'cancelled' },
  authenticated: { 'subscription.activated': 'active', 'subscription.charged': 'active', 'subscription.cancelled': 'cancelled' },
  active: { 'subscription.charged': 'active', 'subscription.pending': 'pending', 'subscription.halted': 'halted', 'subscription.cancelled': 'cancelled', 'subscription.completed': 'completed' },
  pending: { 'subscription.charged': 'active', 'subscription.pending': 'pending', 'subscription.halted': 'halted', 'subscription.cancelled': 'cancelled' },
  halted: { 'subscription.charged': 'active', 'subscription.resumed': 'active', 'subscription.cancelled': 'cancelled' },
  cancelled: {},
  completed: {},
}

export const isAutopayEvent = (value: string): value is AutopayEvent => (AUTOPAY_EVENTS as readonly string[]).includes(value)

/** The next state for `event`, or null when the event is ignored in this state. A missing state counts as 'created'. */
export function nextAutopay(current: AutopayStatus | null | undefined, event: string): AutopayStep | null {
  if (!isAutopayEvent(event)) return null
  const status = TRANSITIONS[current ?? 'created'][event]
  if (!status) return null
  return { status, effect: EFFECT[event] ?? 'none' }
}

/** Autopay will take the next payment by itself (no "pay now" reminders needed). */
export const autopayCovers = (status: AutopayStatus | null | undefined): boolean => status === 'authenticated' || status === 'active'

/**
 * The subscription renews by itself (a UPI/card mandate or a Razorpay
 * subscription), so a due bill for the next period would be paid twice
 * (V2-REVIEW M-M2). Same test the dunning job uses.
 */
export const renewsAutomatically = (sub: { autopay?: { status?: string | null } | null; razorpaySubscriptionId?: string | null; status?: string | null; cancelAtPeriodEnd?: boolean | null } | null | undefined): boolean =>
  Boolean(sub) && (autopayCovers(sub!.autopay?.status as AutopayStatus | null) || (Boolean(sub!.razorpaySubscriptionId) && sub!.status === 'active' && !sub!.cancelAtPeriodEnd))
