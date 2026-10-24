import { addDays, isoDateIST, istInstant, minutesOfDayIST, weekday } from '@/lib/dates'

/**
 * Orbit follow-up sequences (MVP): the step vocabulary, the IST send window
 * (Monday to Saturday), template variables and why an enrolment stops. Pure,
 * client-safe.
 */

export const MAX_STEPS = 5
export const DEFAULT_DAILY_CAP = 150
export const MAX_DAILY_CAP = 500
export const MAX_WAIT_DAYS = 30
export const DEFAULT_WINDOW = { startHour: 10, endHour: 18 } as const

export const STEP_KINDS = ['email', 'call', 'reminder', 'wait'] as const
export type StepKind = (typeof STEP_KINDS)[number]
export const STEP_LABEL: Record<StepKind, string> = { email: 'Send email', call: 'Call task', reminder: 'Reminder', wait: 'Wait' }

export type SequenceStep = Readonly<{ kind: StepKind; subject?: string; body?: string; note?: string; waitDays?: number }>
export type SendWindow = Readonly<{ startHour: number; endHour: number }>

export const EXIT_REASONS = ['replied', 'bounced', 'unsubscribed', 'won', 'lost', 'manual', 'no_email', 'archived', 'lead_gone', 'failed'] as const
export type ExitReason = (typeof EXIT_REASONS)[number]
export const EXIT_LABEL: Record<ExitReason, string> = {
  replied: 'Replied',
  bounced: 'Email bounced',
  unsubscribed: 'Unsubscribed',
  won: 'Lead converted',
  lost: 'Lead closed',
  manual: 'Removed',
  no_email: 'No email address',
  archived: 'Sequence archived',
  lead_gone: 'Lead deleted',
  failed: 'Sending kept failing',
}

const SUNDAY = 0

/** Monday to Saturday, from startHour to endHour IST. */
export function inSendWindow(now: Date, w: SendWindow): boolean {
  const day = isoDateIST(now)
  const minutes = minutesOfDayIST(now)
  return weekday(day) !== SUNDAY && minutes >= w.startHour * 60 && minutes < w.endHour * 60
}

/** The next moment the window opens: today if before it, otherwise the next Monday-to-Saturday day. */
export function nextWindowStart(now: Date, w: SendWindow): Date {
  const today = isoDateIST(now)
  const open = (day: string) => istInstant(day, `${String(w.startHour).padStart(2, '0')}:00`)
  if (weekday(today) !== SUNDAY && now.getTime() < open(today).getTime()) return open(today)
  let day = addDays(today, 1)
  while (weekday(day) === SUNDAY) day = addDays(day, 1)
  return open(day)
}

/** Opening time of the next send day after today (used when today's cap is spent). */
export function nextDayWindowStart(now: Date, w: SendWindow): Date {
  let day = addDays(isoDateIST(now), 1)
  while (weekday(day) === SUNDAY) day = addDays(day, 1)
  return istInstant(day, `${String(w.startHour).padStart(2, '0')}:00`)
}

export type TemplateVars = Readonly<{ first_name: string; company: string; owner: string }>
export const TEMPLATE_VARIABLES = ['first_name', 'company', 'owner'] as const

export const firstNameOf = (contactName: string | null | undefined): string => (contactName ?? '').trim().split(/\s+/)[0] ?? ''

/**
 * Fills {{first_name}}, {{company}} and {{owner}}. A fallback after a bar is
 * used when the value is empty: {{first_name|there}}. Unknown variables are
 * left as typed, so a typo is visible in the preview.
 */
export function renderTemplate(text: string, vars: TemplateVars): string {
  return text.replace(/\{\{\s*([a-z_]+)\s*(?:\|([^}]*))?\}\}/g, (match, name: string, fallback: string | undefined) => {
    if (!(TEMPLATE_VARIABLES as readonly string[]).includes(name)) return match
    const value = vars[name as keyof TemplateVars].trim()
    return value || (fallback ?? '').trim()
  })
}

/** Variables used in a template that Flowbit does not know (shown as a builder error). */
export function unknownVariables(text: string): string[] {
  const names = [...text.matchAll(/\{\{\s*([a-z_]+)\s*(?:\|[^}]*)?\}\}/g)].map((m) => m[1])
  return [...new Set(names.filter((n) => !(TEMPLATE_VARIABLES as readonly string[]).includes(n)))]
}

/** Why an enrolment must stop because of the lead's stage, or null while it is open. */
export function exitForStage(stage: string): ExitReason | null {
  if (stage === 'converted') return 'won'
  if (stage === 'lost' || stage === 'disqualified') return 'lost'
  return null
}

/**
 * True when an edit adds, removes or reorders steps. Enrolments keep their
 * place as a step number, so such an edit would make live leads skip or
 * repeat steps; wording and wait lengths can change freely.
 */
export function changesStepOrder<A extends Pick<SequenceStep, 'kind'>, B extends Pick<SequenceStep, 'kind'>>(before: readonly A[], after: readonly B[]): boolean {
  return before.length !== after.length || before.some((step, i) => step.kind !== after[i].kind)
}

/** Why an enrolment must stop when the lead moves: a closed stage, or a new or contacted lead moving to Engaged (they replied). */
export function exitForMove(from: string, to: string): ExitReason | null {
  if (to === 'engaged' && (from === 'new' || from === 'contacted')) return 'replied'
  return exitForStage(to)
}

/** Why an enrolment must stop because of an activity logged on the lead: a logged reply stops it. */
export const exitForActivity = (type: string): ExitReason | null => (type === 'reply' ? 'replied' : null)

/** Why an enrolment must stop because of the suppression list. */
export const exitForSuppression = (source: string | null | undefined): ExitReason => (source === 'bounce' || source === 'complaint' ? 'bounced' : 'unsubscribed')

const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** The personal-looking email: the typed paragraphs, then a short unsubscribe footer. */
export function emailParts(body: string, unsubscribeUrl: string): { html: string; text: string } {
  const paragraphs = body.trim().split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
  const html = [
    ...paragraphs.map((p) => `<p style="margin:0 0 14px">${escapeHtml(p).replace(/\n/g, '<br>')}</p>`),
    `<p style="margin:24px 0 0;font-size:12px;color:#888">Not interested? <a href="${escapeHtml(unsubscribeUrl)}" style="color:#888">Unsubscribe</a></p>`,
  ].join('\n')
  const text = `${paragraphs.join('\n\n')}\n\n--\nNot interested? Unsubscribe: ${unsubscribeUrl}`
  return { html: `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#222">${html}</div>`, text }
}

/** When the step after `kind` should run: a wait pushes it out by its days, anything else runs straight after. */
export function nextRunAfter(step: SequenceStep, now: Date): Date {
  return step.kind === 'wait' ? new Date(now.getTime() + Math.max(1, step.waitDays ?? 1) * 86_400_000) : now
}

/** "Step 2 of 4: Send email" for the lead page. */
export function progressLabel(stepIndex: number, steps: readonly SequenceStep[]): string {
  if (stepIndex >= steps.length) return 'All steps done'
  return `Step ${stepIndex + 1} of ${steps.length}: ${STEP_LABEL[steps[stepIndex].kind]}`
}
