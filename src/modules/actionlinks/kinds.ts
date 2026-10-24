/**
 * One-tap actions from outside the app (notifications-v2 §0b.14 and §2.5):
 * what each kind of signed link may do and how its choices read. Pure and
 * client-safe; the server side is registry.ts.
 */

export const ACTION_KINDS = ['leave', 'timesheet', 'claim', 'correction', 'bank_change', 'task'] as const
export type ActionKind = (typeof ACTION_KINDS)[number]

export const ACTION_CHOICES = ['approve', 'reject', 'done', 'snooze'] as const
export type ActionChoice = (typeof ACTION_CHOICES)[number]

/** What a notification is about when it can carry Approve / Reject (or Mark done / Snooze) buttons. */
export type ActionSubject = Readonly<{ kind: ActionKind; id: string }>

export type NoteRule = 'none' | 'optional' | 'required'

export type KindRules = Readonly<{
  label: string
  /** The buttons this kind offers, in order. */
  choices: readonly ActionChoice[]
  /** A note on a rejection, as the app asks for it (minimum length when required). */
  rejectNote: NoteRule
  noteMin: number
  /** Where the request opens in the app. */
  href: (id: string) => string
}>

export const KIND_RULES: Readonly<Record<ActionKind, KindRules>> = {
  leave: { label: 'Leave request', choices: ['approve', 'reject'], rejectNote: 'required', noteMin: 1, href: () => '/app/hr/leave' },
  timesheet: { label: 'Timesheet', choices: ['approve', 'reject'], rejectNote: 'required', noteMin: 5, href: () => '/app/work/time/approvals' },
  claim: { label: 'Expense claim', choices: ['approve', 'reject'], rejectNote: 'required', noteMin: 3, href: () => '/app/hr/claims' },
  correction: { label: 'Attendance correction', choices: ['approve', 'reject'], rejectNote: 'required', noteMin: 1, href: () => '/app/hr/attendance/corrections' },
  // A bank change is verified, never "rejected": a wrong account is fixed on the person's record.
  bank_change: { label: 'Bank account change', choices: ['approve'], rejectNote: 'none', noteMin: 0, href: () => '/app/hr/payroll' },
  task: { label: 'Task', choices: ['done', 'snooze'], rejectNote: 'none', noteMin: 0, href: (id) => `/app/work/tasks/${id}` },
}

/**
 * Kinds that move money or bank details: their links work only for the person they were sent to, signed in.
 * A forwarded mail, a shared inbox or a mail-gateway preview must not be able to verify a salary account or
 * approve a payout. Other kinds keep the spec's one-tap links (notifications-v2 §0b.14).
 */
export const SIGN_IN_KINDS: readonly ActionKind[] = ['bank_change', 'claim']
export const needsSignIn = (kind: string | null | undefined): boolean => (SIGN_IN_KINDS as readonly string[]).includes(kind ?? '')

/** Days an emailed action button works (token.ts ACTION_LINK_TTL_MS). */
export const ACTION_LINK_DAYS = 7

/**
 * The sign-in rule of emailed action buttons, in words (B22), for the FAQ and
 * the manual: one tap, once, for 7 days, for whoever holds the email, except
 * claims and bank changes, which need the recipient signed in.
 */
export const ACTION_LINK_RULE = `Each button works once, for ${ACTION_LINK_DAYS} days, without signing in, for whoever has the email, so don't forward approval emails. Expense claims and bank account changes ask the person they were sent to to sign in first.`

export const CHOICE_LABELS: Readonly<Record<ActionChoice, string>> = { approve: 'Approve', reject: 'Reject', done: 'Mark done', snooze: 'Snooze 1 day' }

/** The button label for a bank change reads "Verify". */
export const choiceLabel = (kind: ActionKind, choice: ActionChoice): string => (kind === 'bank_change' && choice === 'approve' ? 'Verify' : CHOICE_LABELS[choice])

export const isActionKind = (value: unknown): value is ActionKind => typeof value === 'string' && (ACTION_KINDS as readonly string[]).includes(value)
export const isActionChoice = (value: unknown): value is ActionChoice => typeof value === 'string' && (ACTION_CHOICES as readonly string[]).includes(value)

/** Why a note is not acceptable for this choice, or null. */
export function noteProblem(kind: ActionKind, choice: ActionChoice, note: string | null | undefined): string | null {
  const rules = KIND_RULES[kind]
  if (choice !== 'reject' || rules.rejectNote !== 'required') return null
  const text = (note ?? '').trim()
  if (text.length >= Math.max(1, rules.noteMin)) return null
  return rules.noteMin > 1 ? `Say why in at least ${rules.noteMin} characters, so they know what to fix.` : 'Add a note so they know why.'
}

/**
 * Whether the bound person still holds the permission the decision needs, checked before the confirmation page
 * offers buttons (R1 4.8). The decision itself still runs every check (stage, month lock) on submit.
 */
export function mayStillDecide(opts: Readonly<{ perm?: string; anyPerm?: readonly string[] }>, can: (perm: string) => boolean): boolean {
  if (opts.perm && !can(opts.perm)) return false
  if (opts.anyPerm?.length && !opts.anyPerm.some(can)) return false
  return true
}
