import { describe, expect, it } from 'vitest'
import { istInstant } from '@/lib/dates'
import { alertEventFor, messagesClient, planRun, renderAction, rulesForEvent, type RuleLike } from './plan'
import { RECIPES, recipeByKey } from './recipes'
import { inactiveWorkspaceNote, runOutcome } from './run-status'
import { newSignupTrialSubscription } from '@/lib/plans'
import { conditionHolds, conditionsHold, renderTemplate, unknownVariables } from './template'
import { dateWindow, dedupeKeyFor, isCapReached, nextBusinessTime, planRunAt, scanDue, scheduleOccurrence } from './timing'

const QUIET = { enabled: true, start: '21:00', end: '08:00' }
// Thursday 8 Oct 2026, 11:00 IST
const NOW = istInstant('2026-10-08', '11:00')

const rule = (overrides: Partial<RuleLike> = {}): RuleLike => ({
  id: 'r1',
  enabled: true,
  trigger: { type: 'event', event: 'payment.received' },
  conditions: [],
  actions: [{ type: 'message', recipient: 'client', channel: 'email', subject: 'Thanks {{client_name}}', body: 'Got {{amount}}.' }],
  delayMinutes: 0,
  businessHoursOnly: false,
  dailyCapPerContact: 3,
  ...overrides,
})

const subject = { entity: 'Invoice', entityId: 'inv1', occurrence: 'rct1', vars: { client_name: 'Ravi', amount: '₹500.00', balance_due_paise: 0 }, refs: {} }

describe('trigger matching', () => {
  it('picks enabled event rules for the exact key only', () => {
    const rules = [rule(), rule({ id: 'off', enabled: false }), rule({ id: 'other', trigger: { type: 'event', event: 'invoice.issued' } }), rule({ id: 'date', trigger: { type: 'date', source: 'invoice_due', offset: 30, unit: 'days' } })]
    expect(rulesForEvent(rules, 'payment.received').map((r) => r.id)).toEqual(['r1'])
    expect(rulesForEvent(rules, 'payment')).toEqual([])
  })

  it('does not fire a rule that is off or whose conditions fail', () => {
    expect(planRun(rule({ enabled: false }), subject, { now: NOW, quiet: null })).toEqual({ fire: false, reason: 'off' })
    expect(planRun(rule({ conditions: [{ field: 'balance_due_paise', op: 'gt', value: 0 }] }), subject, { now: NOW, quiet: null })).toEqual({ fire: false, reason: 'conditions' })
  })

  it('a test run fires at once whatever the rule says, without a dedupe key', () => {
    expect(planRun(rule({ enabled: false, delayMinutes: 120 }), subject, { now: NOW, quiet: QUIET, test: true })).toEqual({ fire: true, dedupeKey: null, dueAt: NOW })
  })
})

describe('conditions', () => {
  it('compares numbers as numbers and text without case', () => {
    expect(conditionHolds({ field: 'n', op: 'gte', value: '10' }, { n: 10 })).toBe(true)
    expect(conditionHolds({ field: 'n', op: 'gt', value: 10 }, { n: '9' })).toBe(false)
    expect(conditionHolds({ field: 'n', op: 'lt', value: 10 }, { n: 'abc' })).toBe(false)
    expect(conditionHolds({ field: 's', op: 'eq', value: 'Sent' }, { s: 'sent' })).toBe(true)
    expect(conditionHolds({ field: 's', op: 'ne', value: 'sent' }, { s: 'accepted' })).toBe(true)
    expect(conditionHolds({ field: 'tag', op: 'contains', value: 'vip' }, { tag: 'Key VIP client' })).toBe(true)
    expect(conditionHolds({ field: 'x', op: 'empty' }, {})).toBe(true)
    expect(conditionHolds({ field: 'x', op: 'not_empty' }, { x: 0 })).toBe(true)
  })

  it('needs every condition', () => {
    expect(conditionsHold([], {})).toBe(true)
    expect(conditionsHold([{ field: 'a', op: 'eq', value: 1 }, { field: 'b', op: 'eq', value: 2 }], { a: 1, b: 3 })).toBe(false)
  })
})

describe('wording', () => {
  it('fills variables and blanks unknown ones', () => {
    expect(renderTemplate('Hi {{client_name}}, {{ amount }} for {{missing}}.', { client_name: 'Ravi', amount: 500 })).toBe('Hi Ravi, 500 for .')
    expect(unknownVariables('{{client_name}} {{clinet_name}}', ['client_name'])).toEqual(['clinet_name'])
  })

  it('renders subject and paragraphs, marking a test', () => {
    const out = renderAction({ subject: 'Thanks {{client_name}}', body: 'One {{amount}}.\n\nTwo.' }, { client_name: 'Ravi', amount: '₹5' }, true)
    expect(out).toEqual({ subject: '[Test] Thanks Ravi', body: 'One ₹5.\n\nTwo.', paragraphs: ['One ₹5.', 'Two.'] })
  })
})

describe('dedupe and caps', () => {
  it('keys a run by rule, record and occurrence', () => {
    expect(dedupeKeyFor('r1', { entity: 'Invoice', entityId: 'inv1', occurrence: 'rct1' })).toBe('r1:Invoice:inv1:rct1')
    expect(dedupeKeyFor('r1', { entity: 'Quote', entityId: 'q1' })).toBe('r1:Quote:q1:once')
    expect(planRun(rule(), subject, { now: NOW, quiet: null })).toMatchObject({ fire: true, dedupeKey: 'r1:Invoice:inv1:rct1' })
  })

  it('stops at the daily cap per contact (0 = no cap)', () => {
    expect(isCapReached(2, 3)).toBe(false)
    expect(isCapReached(3, 3)).toBe(true)
    expect(isCapReached(50, 0)).toBe(false)
  })
})

describe('delays, business hours and quiet hours', () => {
  it('waits the delay', () => {
    expect(planRunAt({ now: NOW, delayMinutes: 120, businessHoursOnly: false, quiet: null })).toEqual(istInstant('2026-10-08', '13:00'))
  })

  it('moves to the next business opening (Mon–Sat 10:00–19:00 IST, the default workday)', () => {
    expect(nextBusinessTime(NOW)).toEqual(NOW)
    expect(nextBusinessTime(istInstant('2026-10-08', '07:30'))).toEqual(istInstant('2026-10-08', '10:00'))
    expect(nextBusinessTime(istInstant('2026-10-08', '19:30'))).toEqual(istInstant('2026-10-09', '10:00'))
    // Saturday evening → Monday morning (Sunday is off)
    expect(nextBusinessTime(istInstant('2026-10-10', '19:00'))).toEqual(istInstant('2026-10-12', '10:00'))
    expect(planRunAt({ now: istInstant('2026-10-08', '18:00'), delayMinutes: 120, businessHoursOnly: true, quiet: null })).toEqual(istInstant('2026-10-09', '10:00'))
  })

  it('holds client messages until quiet hours end; alerts to people do not wait', () => {
    const late = istInstant('2026-10-08', '22:15')
    expect(planRun(rule(), subject, { now: late, quiet: QUIET })).toMatchObject({ dueAt: istInstant('2026-10-09', '08:00') })
    const alertOnly = rule({ actions: [{ type: 'notify', recipient: 'owner', subject: 'x', body: 'y' }] })
    expect(messagesClient(alertOnly)).toBe(false)
    expect(planRun(alertOnly, subject, { now: late, quiet: QUIET })).toMatchObject({ dueAt: late })
    expect(planRun(rule(), subject, { now: late, quiet: { ...QUIET, enabled: false } })).toMatchObject({ dueAt: late })
  })
})

describe('time triggers', () => {
  it('covers records whose date + offset has come, with a short catch-up window', () => {
    expect(dateWindow({ offset: 30, unit: 'days' }, NOW)).toEqual({ unit: 'days', from: '2026-09-05', to: '2026-09-08' })
    expect(dateWindow({ offset: 3, unit: 'days' }, NOW)).toEqual({ unit: 'days', from: '2026-10-02', to: '2026-10-05' })
  })

  it('never reaches past dates for "before" offsets', () => {
    expect(dateWindow({ offset: -2, unit: 'days' }, NOW)).toEqual({ unit: 'days', from: '2026-10-08', to: '2026-10-10' })
    const meeting = dateWindow({ offset: -15, unit: 'minutes' }, NOW)
    expect(meeting).toEqual({ unit: 'minutes', fromAt: NOW, toAt: new Date(NOW.getTime() + 15 * 60_000) })
    const approval = dateWindow({ offset: 24, unit: 'hours' }, NOW)
    expect(approval.unit === 'hours' && approval.toAt).toEqual(new Date(NOW.getTime() - 24 * 3_600_000))
  })

  it('runs a monthly schedule once, on its day, after its time', () => {
    const monthly = { frequency: 'monthly' as const, day: 1, time: '10:00' }
    expect(scheduleOccurrence(monthly, istInstant('2026-11-01', '09:30'), null)).toBeNull()
    expect(scheduleOccurrence(monthly, istInstant('2026-11-01', '10:05'), null)).toBe('2026-11')
    expect(scheduleOccurrence(monthly, istInstant('2026-11-01', '12:00'), '2026-11')).toBeNull()
    expect(scheduleOccurrence(monthly, istInstant('2026-11-02', '12:00'), '2026-10')).toBeNull()
    expect(scheduleOccurrence({ frequency: 'weekly', day: 4, time: '09:00' }, NOW, null)).toBe('2026-10-08')
    expect(scheduleOccurrence({ frequency: 'daily', time: '09:00' }, NOW, '2026-10-07')).toBe('2026-10-08')
  })

  it('scans minute rules every run, hour rules every 30 minutes and day rules once a day from 09:00', () => {
    const minutes = { type: 'date' as const, unit: 'minutes' as const }
    const hours = { type: 'date' as const, unit: 'hours' as const }
    const days = { type: 'date' as const, unit: 'days' as const }
    expect(scanDue(minutes, NOW, NOW)).toBe(true)
    expect(scanDue(hours, new Date(NOW.getTime() - 10 * 60_000), NOW)).toBe(false)
    expect(scanDue(hours, new Date(NOW.getTime() - 31 * 60_000), NOW)).toBe(true)
    expect(scanDue(days, istInstant('2026-10-08', '09:05'), NOW)).toBe(false)
    expect(scanDue(days, istInstant('2026-10-07', '09:05'), NOW)).toBe(true)
    expect(scanDue(days, null, istInstant('2026-10-08', '08:30'))).toBe(false)
  })

  it('routes alerts to the matching notification group', () => {
    expect(alertEventFor({ source: 'meeting_start' })).toBe('meeting.reminder')
    expect(alertEventFor({ source: 'approval_requested' })).toBe('leave.requested')
    expect(alertEventFor({ event: 'quote.accepted' })).toBe('folio.automation')
  })
})

describe('run outcome', () => {
  it('is failed, skipped or done from its steps', () => {
    expect(runOutcome([{ status: 'sent' }, { status: 'failed' }])).toBe('failed')
    expect(runOutcome([{ status: 'skipped' }])).toBe('skipped')
    expect(runOutcome([])).toBe('skipped')
    expect(runOutcome([{ status: 'skipped' }, { status: 'notified' }])).toBe('done')
  })
})

describe('ready recipes', () => {
  it('turns the payment thank-you and part payment on by default; invoice sending stays off', () => {
    expect(recipeByKey('payment_thank_you')?.defaultEnabled).toBe(true)
    expect(recipeByKey('part_payment_ack')?.defaultEnabled).toBe(true)
    expect(recipeByKey('invoice_send')?.defaultEnabled).toBe(false)
    expect(recipeByKey('monthly_statement')?.defaultEnabled).toBe(false)
    expect(recipeByKey('quote_accepted')?.defaultEnabled).toBe(true)
    expect(recipeByKey('utr_shared')?.defaultEnabled).toBe(true)
    expect(recipeByKey('meeting_reminder')?.defaultEnabled).toBe(true)
  })

  it('thanks a full payment and acknowledges a part payment, never both', () => {
    const thanks = recipeByKey('payment_thank_you')
    const part = recipeByKey('part_payment_ack')
    const run = (balance: number) => [thanks, part].filter((r) => r && conditionsHold(r.spec.conditions, { balance_due_paise: balance })).map((r) => r?.key)
    expect(run(0)).toEqual(['payment_thank_you'])
    expect(run(5000)).toEqual(['part_payment_ack'])
  })

  it('has unique keys and wording that only uses its own variables', () => {
    expect(new Set(RECIPES.map((r) => r.key)).size).toBe(RECIPES.length)
    for (const r of RECIPES) {
      for (const a of r.spec.actions) expect(unknownVariables(`${a.subject ?? ''} ${a.body}`, r.variables), r.key).toEqual([])
    }
  })

  it('every non-bridge recipe does something, and the reminder schedule is a bridge', () => {
    for (const r of RECIPES.filter((x) => !x.bridge)) expect(r.spec.actions.length, r.key).toBeGreaterThan(0)
    expect(recipeByKey('payment_reminders')?.bridge).toBe('folio_reminders')
  })
})

describe('plain-English rule descriptions', () => {
  it('describes events, offsets and schedules', async () => {
    const { describeTiming, describeTrigger } = await import('./describe')
    expect(describeTrigger({ type: 'event', event: 'payment.received' })).toBe('A payment is received or a receipt recorded')
    expect(describeTrigger({ type: 'date', source: 'invoice_due', offset: 30, unit: 'days' })).toBe('30 days after its due date, for an unpaid invoice')
    expect(describeTrigger({ type: 'date', source: 'meeting_start', offset: -15, unit: 'minutes' })).toBe('15 minutes before its start, for a meeting')
    expect(describeTrigger({ type: 'date', source: 'approval_requested', offset: 1, unit: 'hours' })).toBe('1 hour after the time it was asked, for a pending leave request')
    expect(describeTrigger({ type: 'schedule', source: 'clients_with_dues', frequency: 'monthly', day: 1, time: '10:00' })).toBe('On the 1st of each month at 10:00, for each client who owes money')
    expect(describeTiming({ delayMinutes: 120, businessHoursOnly: true })).toBe('waits 2 hours, business hours only')
    expect(describeTiming({ delayMinutes: 0, businessHoursOnly: false })).toBeNull()
  })
})

describe('V2-REVIEW T1: delayed runs of inactive workspaces', () => {
  const now = new Date('2026-10-08T06:00:00Z')
  const DAY = 86_400_000
  const trial = (daysAgo: number, extra: object = {}) => ({ createdAt: new Date(now.getTime() - daysAgo * DAY), subscription: newSignupTrialSubscription(new Date(now.getTime() - daysAgo * DAY)), ...extra })
  it('sends for an active workspace', () => {
    expect(inactiveWorkspaceNote(trial(1), now)).toBeNull()
  })
  it('skips a disabled, deleted, missing or lapsed workspace', () => {
    expect(inactiveWorkspaceNote(trial(1, { disabled: true }), now)).toMatch(/not active/)
    expect(inactiveWorkspaceNote(trial(1, { deletedAt: now }), now)).toMatch(/not active/)
    expect(inactiveWorkspaceNote(null, now)).toMatch(/no longer exists/)
    expect(inactiveWorkspaceNote(trial(400), now)).toMatch(/not active/)
  })
})
