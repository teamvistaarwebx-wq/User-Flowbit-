import { describe, expect, it } from 'vitest'
import { istInstant } from '@/lib/dates'
import { groupForEvent } from '@/modules/messaging/events'
import { resolveChannels, workspaceChannels, EMPTY_PERSONAL_PREFS, EMPTY_WORKSPACE_PREFS } from '@/modules/messaging/preferences'
import { groupByKey } from '@/modules/messaging/events'
import { EVENT_TRIGGERS, isContactRecipient, SOURCE_TRIGGERS, triggerDef } from './catalog'
import { messagesClient, planRun, type RuleLike } from './plan'
import { RECIPES, recipeByKey } from './recipes'
import { datesBetween, monthDayKeys, occurrenceIn, yearsAt } from './sources/people-dates'
import { unknownVariables } from './template'
import { dateWindow, scheduleOccurrence } from './timing'
import { validateCustomRule, type CustomRuleInput } from './validate'

const NOW = istInstant('2026-10-08', '11:00')

const asRule = (key: string): RuleLike => {
  const r = recipeByKey(key)!
  return { id: key, enabled: true, ...r.spec }
}

describe('every ready recipe is consistent with the trigger catalog', () => {
  it('uses a known trigger, its recipients, its variables and a real notification group', () => {
    for (const recipe of RECIPES.filter((r) => !r.bridge)) {
      const def = triggerDef(recipe.spec.trigger)
      expect(def, recipe.key).not.toBeNull()
      for (const action of recipe.spec.actions) {
        expect(def!.recipients, `${recipe.key} → ${action.recipient}`).toContain(action.recipient)
        expect(unknownVariables(`${action.subject ?? ''} ${action.body}`, recipe.variables), recipe.key).toEqual([])
        if (action.type === 'message') expect(isContactRecipient(action.recipient), recipe.key).toBe(true)
        else expect(['client', 'lead'], recipe.key).not.toContain(action.recipient)
      }
      for (const c of recipe.spec.conditions) expect([...def!.variables, ...(def!.conditionFields ?? [])], recipe.key).toContain(c.field)
      if (recipe.spec.actions.some((a) => a.type === 'notify')) expect(groupForEvent(def!.alertEvent).key, recipe.key).not.toBe('other')
    }
  })

  it('has the Sales, People and compliance recipes with the spec defaults', () => {
    const on = (key: string) => recipeByKey(key)?.defaultEnabled
    for (const key of ['new_lead', 'lead_not_contacted_2h', 'lead_not_contacted_24h', 'deal_idle_7d', 'deal_won', 'attendance_nudge', 'checkout_nudge', 'birthday_wish', 'anniversary_wish', 'new_joiner_welcome', 'onboarding_docs_reminder', 'payslip_ready_note', 'compliance_reminder']) expect(on(key), key).toBe(false)
    expect(on('probation_ending')).toBe(true)
    expect(on('document_expiring')).toBe(true)
  })
})

describe('Sales recipe triggers and conditions', () => {
  it('new lead: alerts the assignee and welcomes the lead by email on lead.created', () => {
    const r = recipeByKey('new_lead')!
    expect(r.spec.trigger).toEqual({ type: 'event', event: 'lead.created' })
    expect(r.spec.actions.map((a) => `${a.type}:${a.recipient}`)).toEqual(['notify:assignee', 'message:lead'])
    expect(messagesClient(r.spec)).toBe(true)
  })

  it('lead not contacted: 2 hours nudges the assignee, 24 hours the sales manager, only while uncontacted', () => {
    const two = asRule('lead_not_contacted_2h')
    const day = asRule('lead_not_contacted_24h')
    expect(two.trigger).toMatchObject({ type: 'date', source: 'lead_created', offset: 2, unit: 'hours' })
    expect(day.trigger).toMatchObject({ offset: 24, unit: 'hours' })
    expect(day.actions[0].recipient).toBe('sales_manager')
    const lead = (contacted: string) => ({ entity: 'Lead', entityId: 'l1', vars: { contacted }, refs: {} })
    expect(planRun(two, lead('no'), { now: NOW, quiet: null }).fire).toBe(true)
    expect(planRun(two, lead('yes'), { now: NOW, quiet: null })).toEqual({ fire: false, reason: 'conditions' })
    const window = dateWindow(two.trigger, NOW)
    expect(window.unit === 'hours' && window.toAt.getTime()).toBe(NOW.getTime() - 2 * 3_600_000)
  })

  it('deal idle 7 days and deal won', () => {
    expect(asRule('deal_idle_7d').trigger).toMatchObject({ type: 'date', source: 'deal_stage_idle', offset: 7, unit: 'days' })
    expect(dateWindow(asRule('deal_idle_7d').trigger, NOW)).toMatchObject({ unit: 'days', to: '2026-10-01' })
    expect(recipeByKey('deal_won')!.spec.actions.map((a) => a.recipient)).toEqual(['team', 'owner'])
  })
})

describe('People recipe triggers and conditions', () => {
  it('attendance at 10:30 and checkout at 19:30, once a day', () => {
    const t = asRule('attendance_nudge').trigger
    expect(t).toMatchObject({ type: 'schedule', source: 'attendance_unmarked', frequency: 'daily', time: '10:30' })
    expect(scheduleOccurrence(t, istInstant('2026-10-08', '10:29'), null)).toBeNull()
    expect(scheduleOccurrence(t, istInstant('2026-10-08', '10:30'), null)).toBe('2026-10-08')
    expect(scheduleOccurrence(t, istInstant('2026-10-08', '12:00'), '2026-10-08')).toBeNull()
    expect(asRule('checkout_nudge').trigger).toMatchObject({ source: 'checkout_missing', time: '19:30' })
  })

  it('birthdays and anniversaries on the day; greetings go to WhatsApp only on the person’s own opt-in', () => {
    expect(asRule('birthday_wish').trigger).toMatchObject({ source: 'employee_birthday', offset: 0 })
    expect(asRule('anniversary_wish').trigger).toMatchObject({ source: 'employee_anniversary', offset: 0 })
    const group = groupByKey('greetings')
    expect(groupForEvent(SOURCE_TRIGGERS.employee_birthday.alertEvent).key).toBe('greetings')
    const workspaceOn = { groups: [{ group: 'greetings', whatsapp: true }], quietHours: EMPTY_WORKSPACE_PREFS.quietHours }
    expect(workspaceChannels(group, workspaceOn).whatsapp).toBe(false)
    const all = { inapp: true, email: true, whatsapp: true }
    expect(resolveChannels('greetings', workspaceOn, EMPTY_PERSONAL_PREFS, all)).toEqual({ inapp: true, email: true, whatsapp: false })
    expect(resolveChannels('greetings', workspaceOn, { ...EMPTY_PERSONAL_PREFS, groups: [{ group: 'greetings', whatsapp: true }] }, all).whatsapp).toBe(true)
  })

  it('new joiner the day before, weekly checklist until complete, probation 15 days and documents 30 days ahead, payslip note on publish', () => {
    expect(asRule('new_joiner_welcome').trigger).toMatchObject({ source: 'employee_joining', offset: -1 })
    expect(dateWindow(asRule('new_joiner_welcome').trigger, NOW)).toMatchObject({ from: '2026-10-08', to: '2026-10-09' })
    const docs = asRule('onboarding_docs_reminder')
    expect(docs.trigger).toMatchObject({ type: 'schedule', frequency: 'weekly', day: 1 })
    const joiner = (pct: number) => ({ entity: 'Employee', entityId: 'e1', vars: { checklist_percent: pct }, refs: {} })
    expect(planRun(docs, joiner(60), { now: NOW, quiet: null }).fire).toBe(true)
    expect(planRun(docs, joiner(100), { now: NOW, quiet: null }).fire).toBe(false)
    expect(dateWindow(asRule('probation_ending').trigger, NOW)).toMatchObject({ to: '2026-10-23' })
    expect(dateWindow(asRule('document_expiring').trigger, NOW)).toMatchObject({ to: '2026-11-07' })
    expect(asRule('payslip_ready_note').trigger).toEqual({ type: 'event', event: 'payslip.published' })
    expect(EVENT_TRIGGERS['payslip.published'].variables).not.toContain('net_pay')
  })

  it('compliance reminder 3 days before each due date to accounts', () => {
    const r = asRule('compliance_reminder')
    expect(r.trigger).toMatchObject({ type: 'date', source: 'compliance_due', offset: -3 })
    expect(r.actions[0].recipient).toBe('accountant')
  })

  it('finds yearly dates in a window, 29 Feb on 28 Feb in other years', () => {
    const days = datesBetween('2027-02-26', '2027-02-28')
    expect(monthDayKeys(days)).toEqual(['02-26', '02-27', '02-28', '02-29'])
    expect(occurrenceIn('1996-02-29', days)).toBe('2027-02-28')
    expect(occurrenceIn('1990-03-01', days)).toBeNull()
    expect(yearsAt('2023-10-08', '2026-10-08')).toBe(3)
  })
})

describe('custom rule builder validation', () => {
  const base: CustomRuleInput = {
    name: 'Big payment → thank the owner',
    trigger: { type: 'event', event: 'payment.received' },
    conditions: [{ field: 'amount_paise', op: 'gte', value: 1000000 }],
    actions: [{ type: 'notify', recipient: 'owner', subject: '{{client_name}} paid {{amount}}', body: 'Against {{invoice_number}}.' }],
    delayMinutes: 0,
    businessHoursOnly: false,
    dailyCapPerContact: 3,
  }

  it('accepts a rule that only uses what its trigger offers', () => {
    const result = validateCustomRule(base)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.spec.trigger).toEqual({ type: 'event', event: 'payment.received' })
  })

  it('refuses unknown triggers, recipients, variables, fields and the wrong kind of step', () => {
    const bad = (patch: Partial<CustomRuleInput>) => {
      const result = validateCustomRule({ ...base, ...patch })
      return result.ok ? {} : result.errors
    }
    expect(bad({ name: 'x' })).toHaveProperty('name')
    expect(bad({ trigger: { type: 'event', event: 'nope' } })).toHaveProperty(['trigger.event'])
    expect(bad({ actions: [{ type: 'notify', recipient: 'attendees', body: 'x' }] })).toHaveProperty(['actions.0.recipient'])
    expect(bad({ actions: [{ type: 'message', recipient: 'owner', body: 'x' }] })).toHaveProperty(['actions.0.recipient'])
    expect(bad({ actions: [{ type: 'notify', recipient: 'client', body: 'x' }] })).toHaveProperty(['actions.0.recipient'])
    expect(bad({ actions: [{ type: 'notify', recipient: 'owner', body: 'Hi {{employee_name}}' }] })).toHaveProperty(['actions.0.body'])
    expect(bad({ conditions: [{ field: 'salary', op: 'gt', value: 1 }] })).toHaveProperty(['conditions.0.field'])
    expect(bad({ actions: [] })).toHaveProperty('actions')
    expect(bad({ dailyCapPerContact: 99 })).toHaveProperty('dailyCapPerContact')
    expect(bad({ trigger: { type: 'event', event: 'lead.created' }, actions: [{ type: 'task', recipient: 'owner', body: 'Call {{lead_name}}' }] })).toHaveProperty(['actions.0.type'])
  })

  it('checks date and schedule triggers against the source', () => {
    expect(validateCustomRule({ ...base, trigger: { type: 'date', source: 'invoice_due', offset: 5, unit: 'days' }, actions: [{ type: 'message', recipient: 'client', channel: 'whatsapp', subject: 'Due', body: '{{invoice_number}} is due' }], conditions: [] }).ok).toBe(true)
    const wrongUnit = validateCustomRule({ ...base, trigger: { type: 'date', source: 'invoice_due', offset: 5, unit: 'minutes' }, conditions: [] })
    expect(wrongUnit.ok ? null : wrongUnit.errors).toHaveProperty(['trigger.unit'])
    const notSchedulable = validateCustomRule({ ...base, trigger: { type: 'schedule', source: 'invoice_due', frequency: 'daily', time: '09:00' }, conditions: [] })
    expect(notSchedulable.ok ? null : notSchedulable.errors).toHaveProperty(['trigger.source'])
    const badTime = validateCustomRule({ ...base, trigger: { type: 'schedule', source: 'attendance_unmarked', frequency: 'weekly', day: 9, time: '25:00' }, actions: [{ type: 'notify', recipient: 'employee', body: 'Hi {{employee_name}}' }], conditions: [] })
    expect(badTime.ok ? null : Object.keys(badTime.errors).sort()).toEqual(['trigger.day', 'trigger.time'])
    const ok = validateCustomRule({ ...base, trigger: { type: 'schedule', source: 'attendance_unmarked', frequency: 'daily', time: '11:00' }, actions: [{ type: 'notify', recipient: 'employee', body: 'Hi {{employee_name}}, check in please' }], conditions: [] })
    expect(ok.ok).toBe(true)
  })
})
