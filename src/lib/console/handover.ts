/**
 * The handover checklist (console spec 9): data, roles, PM invited, kickoff,
 * training, live. Tracked by staff in the Console; the customer sees it as
 * the "Setup guide" card on Home. Pure and client-safe.
 */

export const HANDOVER_STEPS = ['data', 'roles', 'pm', 'kickoff', 'training', 'live'] as const
export type HandoverStep = (typeof HANDOVER_STEPS)[number]

export const HANDOVER_LABEL: Record<HandoverStep, string> = {
  data: 'Bring in your data',
  roles: 'Set up roles',
  pm: 'Invite your project manager',
  kickoff: 'Kickoff call',
  training: 'Team training',
  live: 'Go live',
}

export const HANDOVER_HINT: Record<HandoverStep, string> = {
  data: 'Import your team, employees, projects, leads and clients.',
  roles: 'Decide who sees salaries, invoices and leads.',
  pm: 'Give one person the keys to run Flowbit day to day.',
  kickoff: 'A short call to agree on what goes live first.',
  training: 'A walkthrough for the people who will use it daily.',
  live: 'Everyone works in Flowbit from today.',
}

export type HandoverState = { startedAt?: Date | string | null; steps?: Partial<Record<HandoverStep, { doneAt?: Date | string | null } | null>> | null } | null | undefined

export const stepDone = (state: HandoverState, step: HandoverStep) => Boolean(state?.steps?.[step]?.doneAt)

export type HandoverProgress = { done: number; total: number; complete: boolean; next: HandoverStep | null; started: boolean }

export function handoverProgress(state: HandoverState): HandoverProgress {
  const done = HANDOVER_STEPS.filter((s) => stepDone(state, s)).length
  const next = HANDOVER_STEPS.find((s) => !stepDone(state, s)) ?? null
  return { done, total: HANDOVER_STEPS.length, complete: stepDone(state, 'live'), next, started: Boolean(state?.startedAt) || done > 0 }
}

/** Days a new workspace shows the Setup guide even before staff start a handover. */
export const SETUP_GUIDE_NEW_DAYS = 30
const DAY_MS = 86_400_000

/** The Setup guide card shows while a handover runs, or for a new workspace, until "Go live" is ticked. */
export function showSetupGuide(state: HandoverState, orgCreatedAt: Date | string, now: Date = new Date()): boolean {
  const progress = handoverProgress(state)
  if (progress.complete) return false
  return progress.started || now.getTime() - new Date(orgCreatedAt).getTime() <= SETUP_GUIDE_NEW_DAYS * DAY_MS
}

// ---------------------------------------------------------------------------
// Free setup by the Flowbit team (console spec 9): yearly customers only, at
// most `setupsPerWeek` (Console settings, default 5) started per IST week.
// ---------------------------------------------------------------------------

const IST_OFFSET_MS = 330 * 60_000

/** Monday 00:00 IST of the week `now` falls in, as an instant. */
export function setupWeekStart(now: Date): Date {
  const ist = new Date(now.getTime() + IST_OFFSET_MS)
  const daysSinceMonday = (ist.getUTCDay() + 6) % 7
  const mondayIst = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() - daysSinceMonday)
  return new Date(mondayIst - IST_OFFSET_MS)
}

export type SetupStartInput = Readonly<{
  /** lib/account-types accountTypeOf. */
  accountType: string
  /** The subscription's billing cycle. */
  cycle: string | null | undefined
  /** lib/plans effectiveStatus: a lapsed yearly plan is not a yearly customer any more. */
  status: string
  /** A handover already runs (ticking more steps never counts again). */
  started: boolean
  /** Handovers started since setupWeekStart. */
  startedThisWeek: number
  cap: number
}>

/**
 * Why the Flowbit team may not start a free setup for this workspace now, or
 * null. Internal and Test workspaces are Flowbit's own and never count.
 */
export function setupStartRefusal(input: SetupStartInput): string | null {
  if (input.started) return null
  if (input.accountType === 'internal' || input.accountType === 'test') return null
  const yearly = (input.accountType === 'paid' || input.accountType === 'comped') && input.cycle === 'yearly' && ['active', 'past_due', 'canceled'].includes(input.status)
  if (!yearly) return 'Free setup by the Flowbit team is for yearly customers. Point this workspace to Settings → Import, or move it to a yearly plan first.'
  if (input.startedThisWeek >= input.cap) return `This week's ${input.cap} free ${input.cap === 1 ? 'setup is' : 'setups are'} taken. The next week starts on Monday.`
  return null
}
