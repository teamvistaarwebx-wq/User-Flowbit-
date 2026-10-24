import { EVENT_TRIGGERS, SOURCE_TRIGGERS } from './catalog'
import type { ConditionOp, RecipientType, SourceKey, Trigger } from './types'

/** Plain-English labels for rules (pure, client-safe): the list, the editor and run history. */

export const EVENT_LABELS: Readonly<Record<string, string>> = Object.fromEntries(Object.entries(EVENT_TRIGGERS).map(([k, d]) => [k, d.label]))

export const SOURCE_LABELS: Readonly<Record<SourceKey, { noun: string; field: string }>> = Object.fromEntries(
  Object.entries(SOURCE_TRIGGERS).map(([k, d]) => [k, { noun: d.noun ?? d.label.toLowerCase(), field: d.field ?? '' }]),
) as Record<SourceKey, { noun: string; field: string }>

export const RECIPIENT_LABELS: Readonly<Record<RecipientType, string>> = {
  client: 'The client',
  lead: 'The lead',
  employee: 'The employee',
  owner: 'Workspace owners',
  assignee: 'The assignee',
  manager: 'The manager or project lead',
  attendees: 'Everyone invited',
  approver: 'The approver',
  escalation: 'Escalation approvers',
  hr: 'HR (people who manage leave)',
  sales_manager: 'Sales managers (can close deals)',
  accountant: 'Accounts (Folio settings)',
  team: 'The whole team',
}

export const CONDITION_OP_LABELS: Readonly<Record<ConditionOp, string>> = {
  eq: 'is',
  ne: 'is not',
  gt: 'is more than',
  gte: 'is at least',
  lt: 'is less than',
  lte: 'is at most',
  contains: 'contains',
  empty: 'is empty',
  not_empty: 'is set',
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'}`

const plural = (n: number, unit: string) => `${n} ${n === 1 ? unit.replace(/s$/, '') : unit}`

/** "3 days after its due date", "15 minutes before its start", "On the 1st of each month at 10:00". */
export function describeTrigger(trigger: Trigger): string {
  if (trigger.type === 'event') return EVENT_LABELS[trigger.event ?? ''] ?? `When ${trigger.event}`
  if (trigger.type === 'schedule') {
    const at = trigger.time ?? '09:00'
    const what = trigger.source ? `, for ${SOURCE_LABELS[trigger.source].noun}` : ''
    if (trigger.frequency === 'monthly') return `On the ${ordinal(trigger.day ?? 1)} of each month at ${at}${what}`
    if (trigger.frequency === 'weekly') return `Every ${WEEKDAYS[trigger.day ?? 1]} at ${at}${what}`
    return `Every day at ${at}${what}`
  }
  const source = trigger.source ? SOURCE_LABELS[trigger.source] : null
  const offset = trigger.offset ?? 0
  const amount = plural(Math.abs(offset), trigger.unit ?? 'days')
  if (!source) return `${amount} ${offset < 0 ? 'before' : 'after'}`
  if (offset === 0) return `On ${source.field}, for ${source.noun}`
  return `${amount} ${offset < 0 ? 'before' : 'after'} ${source.field}, for ${source.noun}`
}

/** "after 2 hours", "within business hours" etc. for the list. */
export function describeTiming(rule: { delayMinutes: number; businessHoursOnly: boolean }): string | null {
  const parts = [rule.delayMinutes ? `waits ${rule.delayMinutes >= 60 && rule.delayMinutes % 60 === 0 ? plural(rule.delayMinutes / 60, 'hours') : plural(rule.delayMinutes, 'minutes')}` : null, rule.businessHoursOnly ? 'business hours only' : null].filter(Boolean)
  return parts.length ? parts.join(', ') : null
}
