import { FREE_SEAT_LIMIT, type AccountType } from '@/lib/account-types'
import { formatDate } from '@/lib/dates'
import type { LifecycleStage } from '@/lib/lifecycle'
import { BLOCKED_OPEN_PAGES, READ_ONLY_DAYS } from '@/lib/plans'

/**
 * The words for the lifecycle state in the banner and on the subscription
 * page: where the workspace is, how long is left and what happens next.
 * Pure and client-safe; dates arrive as ISO strings from the shell.
 */

export type LifecycleView = {
  stage: LifecycleStage
  accountType: AccountType
  daysLeft: number | null
  endsAt: string | null
  deleteAt: string | null
  freeWindowEndsAt: string | null
  /** Console setting: Free plan seats (FREE_SEAT_LIMIT when the caller does not pass it). */
  freeSeats?: number
}

export type LifecycleCopy = { state: string; next: string }

const days = (n: number | null) => (n == null ? '' : n === 0 ? 'Last day' : `${n} ${n === 1 ? 'day' : 'days'} left`)

const ENDED: Partial<Record<AccountType, string>> = { free: 'Your free months have ended', trial: 'Your trial has ended' }

export function lifecycleCopy(v: LifecycleView): LifecycleCopy | null {
  const end = formatDate(v.endsAt)
  switch (v.stage) {
    case 'free':
      return { state: `${days(v.daysLeft)} on the Free plan`, next: `On ${end} the free months end. Choose a plan to keep editing; otherwise the workspace becomes read-only for ${READ_ONLY_DAYS} days.` }
    case 'trial': {
      const window = v.freeWindowEndsAt && v.endsAt && v.freeWindowEndsAt > v.endsAt ? ` Or trim to ${v.freeSeats ?? FREE_SEAT_LIMIT} people and stay on Free until ${formatDate(v.freeWindowEndsAt)}.` : ''
      return { state: `${days(v.daysLeft)} in your free trial`, next: `On ${end} the trial ends. Choose a plan to keep editing.${window}` }
    }
    case 'read_only':
      return { state: `${ENDED[v.accountType] ?? 'Your plan has ended'}: read-only, ${days(v.daysLeft).toLowerCase()}`, next: `On ${end} the workspace is locked: only ${BLOCKED_OPEN_PAGES} open. Export works any time.` }
    case 'blocked':
      return { state: `Locked: ${days(v.daysLeft).toLowerCase()} before deletion`, next: `On ${formatDate(v.deleteAt)} the workspace data is deleted. Choose a plan to open it again, or export it first.` }
    default:
      return null
  }
}

type PlanLimits = Readonly<{ freeSeats: number; freeMonths: number; trialDays: number }>

/** The signup subtitle, from the Console's plan settings (R1 1.5). */
export const signupSubtitle = (c: PlanLimits): string =>
  `Free for ${c.freeMonths} months for teams of up to ${c.freeSeats}. Bigger teams get a ${c.trialDays}-day trial. Every product included. No card needed.`

/** The team-size hint when a Free workspace is refused: a trial starts above the Free seats (R1 1.6). */
export const trialSizeHint = (freeSeats: number): string => `Choose more than ${freeSeats} people for a trial`

/**
 * " and invited 3 people" after onboarding. Without an email provider the invites only reach the Outbox, so the
 * owner is told where to copy the links instead (R1 1.7).
 */
export function invitedPhrase(invited: number, linkOnly: number): string {
  if (!invited) return ''
  const people = `${invited} ${invited === 1 ? 'person' : 'people'}`
  if (!linkOnly) return ` and invited ${people}`
  return ` and added ${people}. Email is not set up, so copy their invite links from Settings → Members and send them yourself`
}
