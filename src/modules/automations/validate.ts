import { EVENT_TRIGGERS, isContactRecipient, SOURCE_TRIGGERS, triggerDef } from './catalog'
import { unknownVariables } from './template'
import { CONDITION_OPS, CUSTOM_ACTION_TYPES, FREQUENCIES, MESSAGE_CHANNELS, OFFSET_UNITS, SOURCE_KEYS, type AutomationAction, type Condition, type RuleSpec, type SourceKey, type Trigger } from './types'

/**
 * Checking a rule built from scratch in the editor (pure, client-safe: the
 * builder shows the same errors before saving). A rule may only use what its
 * trigger offers: its variables, its condition fields and its recipients;
 * messages go to people outside the workspace (client, lead, employee),
 * alerts and tasks to people inside it.
 */

export type CustomRuleInput = Readonly<{
  name: string
  trigger: Readonly<{ type: string; event?: string; source?: string; offset?: number; unit?: string; frequency?: string; day?: number; time?: string }>
  conditions: readonly Readonly<{ field: string; op: string; value?: string | number | null }>[]
  actions: readonly Readonly<{ type: string; recipient: string; channel?: string; subject?: string; body: string; dueInDays?: number }>[]
  delayMinutes: number
  businessHoursOnly: boolean
  dailyCapPerContact: number
}>

export type CustomRuleResult = Readonly<{ ok: true; name: string; spec: RuleSpec }> | Readonly<{ ok: false; errors: Readonly<Record<string, string>> }>

const MAX_ACTIONS = 5
const MAX_CONDITIONS = 10
const MAX_OFFSET: Readonly<Record<string, number>> = { minutes: 24 * 60, hours: 24 * 14, days: 366 }
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/
const includes = <T extends string>(list: readonly T[], value: string | undefined): value is T => value !== undefined && (list as readonly string[]).includes(value)

function checkTrigger(input: CustomRuleInput['trigger'], errors: Record<string, string>): Trigger | null {
  if (input.type === 'event') {
    if (!input.event || !EVENT_TRIGGERS[input.event]) errors['trigger.event'] = 'Pick what happens'
    return errors['trigger.event'] ? null : { type: 'event', event: input.event }
  }
  if (!includes(SOURCE_KEYS, input.source)) {
    errors['trigger.source'] = 'Pick what it looks at'
    return null
  }
  const source: SourceKey = input.source
  const def = SOURCE_TRIGGERS[source]
  if (input.type === 'date') {
    if (!def.units?.length) errors['trigger.source'] = 'This one runs on a schedule, not before or after a date'
    else if (!includes(OFFSET_UNITS, input.unit) || !def.units.includes(input.unit)) errors['trigger.unit'] = `Use ${def.units.join(' or ')}`
    const offset = Number(input.offset ?? 0)
    if (!Number.isInteger(offset) || Math.abs(offset) > (MAX_OFFSET[input.unit ?? 'days'] ?? 366)) errors['trigger.offset'] = 'Enter a whole number within range'
    return Object.keys(errors).length ? null : { type: 'date', source, offset, unit: input.unit as Trigger['unit'] }
  }
  if (input.type === 'schedule') {
    if (!def.schedulable) errors['trigger.source'] = 'This one runs before or after a date, not on a schedule'
    if (!includes(FREQUENCIES, input.frequency)) errors['trigger.frequency'] = 'Pick how often'
    const day = Number(input.day ?? 1)
    if (input.frequency === 'weekly' && !(Number.isInteger(day) && day >= 0 && day <= 6)) errors['trigger.day'] = 'Pick a weekday'
    if (input.frequency === 'monthly' && !(Number.isInteger(day) && day >= 1 && day <= 28)) errors['trigger.day'] = 'Pick a day from 1 to 28'
    if (!TIME.test(input.time ?? '')) errors['trigger.time'] = 'Enter a time like 09:30'
    return Object.keys(errors).length ? null : { type: 'schedule', source, frequency: input.frequency as Trigger['frequency'], ...(input.frequency === 'daily' ? {} : { day }), time: input.time }
  }
  errors['trigger.type'] = 'Pick when it runs'
  return null
}

function checkActions(trigger: Trigger, actions: CustomRuleInput['actions'], errors: Record<string, string>): AutomationAction[] {
  const def = triggerDef(trigger)!
  if (!actions.length) errors.actions = 'Add at least one thing to do'
  if (actions.length > MAX_ACTIONS) errors.actions = `At most ${MAX_ACTIONS} steps`
  return actions.slice(0, MAX_ACTIONS).flatMap((a, i) => {
    const at = (k: string) => `actions.${i}.${k}`
    if (!includes(CUSTOM_ACTION_TYPES, a.type)) {
      errors[at('type')] = 'Pick a step'
      return []
    }
    const recipient = a.recipient as AutomationAction['recipient']
    if (!def.recipients.includes(recipient)) errors[at('recipient')] = 'Not available for this trigger'
    else if (a.type === 'message' && !isContactRecipient(recipient)) errors[at('recipient')] = 'Messages go to a client, a lead or an employee; use an alert for your team'
    else if (a.type !== 'message' && isContactRecipient(recipient) && recipient !== 'employee') errors[at('recipient')] = 'Alerts and tasks go to people in the workspace'
    if (a.type === 'task' && !def.recipients.includes('client')) errors[at('type')] = 'Tasks are client follow-ups: use a money trigger'
    if (a.type === 'message' && !includes(MESSAGE_CHANNELS, a.channel ?? 'email')) errors[at('channel')] = 'Pick email or WhatsApp'
    const subject = (a.subject ?? '').trim().slice(0, 200)
    const body = (a.body ?? '').trim()
    if (!body) errors[at('body')] = 'Write the message'
    else if (body.length > 4000) errors[at('body')] = 'Keep it under 4,000 characters'
    const typos = unknownVariables(`${subject} ${body}`, def.variables)
    if (typos.length) errors[at('body')] = `Not a value of this trigger: ${typos.map((t) => `{{${t}}}`).join(', ')}`
    const dueInDays = a.type === 'task' ? Math.max(0, Math.min(60, Math.round(Number(a.dueInDays ?? 0)))) : undefined
    return [{ type: a.type, recipient, ...(a.type === 'message' ? { channel: (a.channel ?? 'email') as AutomationAction['channel'] } : {}), subject, body, ...(dueInDays !== undefined ? { dueInDays } : {}) }]
  })
}

function checkConditions(trigger: Trigger, conditions: CustomRuleInput['conditions'], errors: Record<string, string>): Condition[] {
  const def = triggerDef(trigger)!
  const fields = new Set([...def.variables, ...(def.conditionFields ?? [])])
  if (conditions.length > MAX_CONDITIONS) errors.conditions = `At most ${MAX_CONDITIONS} conditions`
  return conditions.slice(0, MAX_CONDITIONS).flatMap((c, i) => {
    if (!fields.has(c.field)) errors[`conditions.${i}.field`] = 'Not a value of this trigger'
    if (!includes(CONDITION_OPS, c.op)) errors[`conditions.${i}.op`] = 'Pick a test'
    return fields.has(c.field) && includes(CONDITION_OPS, c.op) ? [{ field: c.field, op: c.op, value: c.op === 'empty' || c.op === 'not_empty' ? null : (c.value ?? null) }] : []
  })
}

export function validateCustomRule(input: CustomRuleInput): CustomRuleResult {
  const errors: Record<string, string> = {}
  const name = input.name.trim()
  if (name.length < 3 || name.length > 80) errors.name = 'Give it a name of 3 to 80 characters'
  const trigger = checkTrigger(input.trigger, errors)
  const actions = trigger ? checkActions(trigger, input.actions, errors) : []
  const conditions = trigger ? checkConditions(trigger, input.conditions, errors) : []
  const delayMinutes = Math.round(Number(input.delayMinutes))
  if (!Number.isFinite(delayMinutes) || delayMinutes < 0 || delayMinutes > 60 * 24 * 14) errors.delayMinutes = 'Wait 0 minutes to 14 days'
  const cap = Math.round(Number(input.dailyCapPerContact))
  if (!Number.isFinite(cap) || cap < 0 || cap > 50) errors.dailyCapPerContact = 'Use 0 to 50'
  if (!trigger || Object.keys(errors).length) return { ok: false, errors }
  return { ok: true, name, spec: { trigger, conditions, actions, delayMinutes, businessHoursOnly: Boolean(input.businessHoursOnly), dailyCapPerContact: cap } }
}
