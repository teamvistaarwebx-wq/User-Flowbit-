import type { QuietHours } from '@/modules/messaging/preferences'
import { isContactRecipient, triggerDef } from './catalog'
import { conditionsHold, renderTemplate } from './template'
import { dedupeKeyFor, planRunAt } from './timing'
import type { AutomationAction, RuleSpec, RunSubject, Trigger, Vars } from './types'

/**
 * Deciding whether and when a rule fires for one record (pure; the server
 * side in engine.ts stores and executes what this decides).
 */

export type RuleLike = RuleSpec & Readonly<{ id: string; enabled: boolean }>

/** Enabled rules triggered by this event key. */
export const rulesForEvent = <R extends RuleLike>(rules: readonly R[], key: string): R[] => rules.filter((r) => r.enabled && r.trigger.type === 'event' && r.trigger.event === key)

/** True when a rule messages a client, lead or employee: only those wait for the workspace's quiet hours (people's alerts follow their own settings). */
export const messagesClient = (rule: Pick<RuleSpec, 'actions'>): boolean => rule.actions.some((a) => a.type === 'message' && isContactRecipient(a.recipient))

export type RunPlan = Readonly<{ fire: false; reason: 'off' | 'conditions' }> | Readonly<{ fire: true; dedupeKey: string | null; dueAt: Date }>

export type PlanOptions = Readonly<{ now: Date; quiet: QuietHours | null; test?: boolean }>

/** A test ("Test on me") ignores on/off, conditions, delay and quiet hours, and is never deduplicated. */
export function planRun(rule: RuleLike, subject: RunSubject, { now, quiet, test }: PlanOptions): RunPlan {
  if (test) return { fire: true, dedupeKey: null, dueAt: now }
  if (!rule.enabled) return { fire: false, reason: 'off' }
  if (!conditionsHold(rule.conditions, subject.vars)) return { fire: false, reason: 'conditions' }
  const dueAt = planRunAt({ now, delayMinutes: rule.delayMinutes, businessHoursOnly: rule.businessHoursOnly, quiet: messagesClient(rule) ? quiet : null })
  return { fire: true, dedupeKey: dedupeKeyFor(rule.id, subject), dueAt }
}

export type RenderedAction = Readonly<{ subject: string; body: string; paragraphs: string[] }>

/** The action's wording with the run's values filled in; the body split into paragraphs for the email layout. */
export function renderAction(action: Pick<AutomationAction, 'subject' | 'body'>, vars: Vars, test = false): RenderedAction {
  const subject = renderTemplate(action.subject ?? '', vars).trim()
  const body = renderTemplate(action.body, vars).trim()
  return {
    subject: test ? `[Test] ${subject}` : subject,
    body,
    paragraphs: body.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean),
  }
}

/** The notification group an alert lands in (people's channel settings), from the trigger catalog. */
export function alertEventFor(trigger: Pick<Trigger, 'source' | 'event'> & { type?: string }): string {
  const def = triggerDef({ type: trigger.type ?? (trigger.source ? 'date' : 'event'), event: trigger.event, source: trigger.source })
  return def?.alertEvent ?? 'folio.automation'
}
