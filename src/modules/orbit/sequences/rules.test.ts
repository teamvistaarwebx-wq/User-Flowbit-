import { describe, expect, it } from 'vitest'
import { changesStepOrder, emailParts, exitForActivity, exitForMove, exitForStage, exitForSuppression, firstNameOf, inSendWindow, nextDayWindowStart, nextRunAfter, nextWindowStart, progressLabel, renderTemplate, unknownVariables } from './rules'

const w = { startHour: 10, endHour: 18 }
// 2026-10-10 is a Saturday, 2026-10-11 a Sunday. IST = UTC + 5:30.
const ist = (date: string, time: string) => new Date(`${date}T${time}:00+05:30`)

describe('send window (IST, Monday to Saturday)', () => {
  it('is open inside the hours on a weekday or Saturday, closed on Sunday', () => {
    expect(inSendWindow(ist('2026-10-12', '10:00'), w)).toBe(true)
    expect(inSendWindow(ist('2026-10-10', '17:59'), w)).toBe(true)
    expect(inSendWindow(ist('2026-10-12', '18:00'), w)).toBe(false)
    expect(inSendWindow(ist('2026-10-12', '09:59'), w)).toBe(false)
    expect(inSendWindow(ist('2026-10-11', '12:00'), w)).toBe(false)
  })

  it('opens next at 10 am today, or the next send day, skipping Sunday', () => {
    expect(nextWindowStart(ist('2026-10-12', '08:00'), w)).toEqual(ist('2026-10-12', '10:00'))
    expect(nextWindowStart(ist('2026-10-10', '19:00'), w)).toEqual(ist('2026-10-12', '10:00'))
    expect(nextWindowStart(ist('2026-10-11', '08:00'), w)).toEqual(ist('2026-10-12', '10:00'))
    expect(nextDayWindowStart(ist('2026-10-12', '12:00'), w)).toEqual(ist('2026-10-13', '10:00'))
  })
})

describe('templates', () => {
  const vars = { first_name: 'Asha', company: 'Kiran Foods', owner: 'Vikram' }
  it('fills variables and uses the fallback when a value is empty', () => {
    expect(renderTemplate('Hi {{first_name}}, {{ company }} · {{owner}}', vars)).toBe('Hi Asha, Kiran Foods · Vikram')
    expect(renderTemplate('Hi {{first_name|there}},', { ...vars, first_name: '' })).toBe('Hi there,')
    expect(renderTemplate('Hi {{first_name}},', { ...vars, first_name: '' })).toBe('Hi ,')
  })
  it('leaves unknown variables visible and reports them', () => {
    expect(renderTemplate('{{city}}', vars)).toBe('{{city}}')
    expect(unknownVariables('{{first_name}} {{city|x}} {{city}}')).toEqual(['city'])
  })
  it('takes the first word of the contact name', () => {
    expect(firstNameOf('  Asha  Rao ')).toBe('Asha')
    expect(firstNameOf(null)).toBe('')
  })
})

describe('exits and progress', () => {
  it('stops on converted (won) and on lost or disqualified', () => {
    expect(exitForStage('converted')).toBe('won')
    expect(exitForStage('lost')).toBe('lost')
    expect(exitForStage('disqualified')).toBe('lost')
    expect(exitForStage('engaged')).toBeNull()
  })
  it('stops when a reply is logged or a new or contacted lead moves to Engaged', () => {
    expect(exitForActivity('reply')).toBe('replied')
    expect(exitForActivity('call')).toBeNull()
    expect(exitForMove('contacted', 'engaged')).toBe('replied')
    expect(exitForMove('new', 'engaged')).toBe('replied')
    expect(exitForMove('meeting_booked', 'engaged')).toBeNull()
    expect(exitForMove('new', 'contacted')).toBeNull()
    expect(exitForMove('engaged', 'lost')).toBe('lost')
  })
  it('spots edits that add, remove or reorder steps, but not wording or wait changes', () => {
    const steps = [{ kind: 'email' as const, subject: 'Hi' }, { kind: 'wait' as const, waitDays: 2 }, { kind: 'call' as const }]
    expect(changesStepOrder(steps, [{ kind: 'email', subject: 'Hello' }, { kind: 'wait', waitDays: 3 }, { kind: 'call', note: 'Ring' }])).toBe(false)
    expect(changesStepOrder(steps, [...steps, { kind: 'email' }])).toBe(true)
    expect(changesStepOrder(steps, steps.slice(1))).toBe(true)
    expect(changesStepOrder(steps, [steps[0], steps[2], steps[1]])).toBe(true)
  })
  it('tells a bounce from an unsubscribe', () => {
    expect(exitForSuppression('bounce')).toBe('bounced')
    expect(exitForSuppression('complaint')).toBe('bounced')
    expect(exitForSuppression('one_click')).toBe('unsubscribed')
  })
  it('waits whole days and runs other steps straight after', () => {
    const now = new Date('2026-10-12T05:00:00Z')
    expect(nextRunAfter({ kind: 'wait', waitDays: 3 }, now)).toEqual(new Date('2026-10-15T05:00:00Z'))
    expect(nextRunAfter({ kind: 'email' }, now)).toEqual(now)
  })
  it('labels progress', () => {
    expect(progressLabel(1, [{ kind: 'email' }, { kind: 'call' }])).toBe('Step 2 of 2: Call task')
    expect(progressLabel(2, [{ kind: 'email' }, { kind: 'call' }])).toBe('All steps done')
  })
})

describe('email parts', () => {
  it('escapes the typed text and always adds the unsubscribe link', () => {
    const { html, text } = emailParts('Hi <b>Asha</b>,\n\nSee you & soon', 'https://app/unsubscribe/t')
    expect(html).toContain('Hi &lt;b&gt;Asha&lt;/b&gt;,')
    expect(html).toContain('href="https://app/unsubscribe/t"')
    expect(text).toContain('Unsubscribe: https://app/unsubscribe/t')
  })
})
