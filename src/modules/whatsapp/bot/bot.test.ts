import { describe, expect, it } from 'vitest'
import { botAccess, type BotPerson, type BotWorkspace } from './auth'
import { advanceLeaveFlow, startLeaveFlow, type LeaveFlowData } from './flow'
import { detectLang, parseChoice, parseCommand, parseDate, parseYesNo } from './parse'

const TODAY = '2026-10-08'

describe('bot commands in English and Hindi', () => {
  it('reads English keywords and menu numbers', () => {
    expect(parseCommand('Check in')).toBe('checkin')
    expect(parseCommand('check-in!')).toBe('checkin')
    expect(parseCommand('1')).toBe('checkin')
    expect(parseCommand('CHECKOUT')).toBe('checkout')
    expect(parseCommand('leave balance')).toBe('balance')
    expect(parseCommand('apply leave')).toBe('leave')
    expect(parseCommand('Salary slip')).toBe('payslip')
    expect(parseCommand('menu')).toBe('menu')
    expect(parseCommand('exit')).toBe('cancel')
    // 'cancel' and 'stop' are WhatsApp opt-out words, never bot commands.
    expect(parseCommand('cancel')).toBeNull()
    expect(parseCommand('stop')).toBeNull()
  })

  it('reads Hindi in Devanagari and Hinglish', () => {
    expect(parseCommand('चेक इन')).toBe('checkin')
    expect(parseCommand('हाजिरी')).toBe('checkin')
    expect(parseCommand('चेक आउट')).toBe('checkout')
    expect(parseCommand('छुट्टी बैलेंस')).toBe('balance')
    expect(parseCommand('छुट्टी चाहिए')).toBe('leave')
    expect(parseCommand('chutti')).toBe('leave')
    expect(parseCommand('पेस्लिप')).toBe('payslip')
    expect(parseCommand('नमस्ते')).toBe('menu')
    expect(parseCommand('रद्द')).toBe('cancel')
    expect(detectLang('छुट्टी')).toBe('hi')
    expect(detectLang('leave')).toBe('en')
    expect(detectLang('4')).toBeNull()
  })

  it('leaves ordinary chat alone', () => {
    expect(parseCommand('Can you send the invoice for October?')).toBeNull()
    expect(parseCommand('I will check in later today')).toBeNull()
  })

  it('reads dates, yes/no and menu choices', () => {
    expect(parseDate('today', TODAY)).toBe(TODAY)
    expect(parseDate('कल', TODAY)).toBe('2026-10-09')
    expect(parseDate('12 Oct', TODAY)).toBe('2026-10-12')
    expect(parseDate('Oct 12', TODAY)).toBe('2026-10-12')
    expect(parseDate('12/10', TODAY)).toBe('2026-10-12')
    expect(parseDate('5/1', TODAY)).toBe('2027-01-05')
    expect(parseDate('12-10-2026', TODAY)).toBe('2026-10-12')
    expect(parseDate('2026-11-03', TODAY)).toBe('2026-11-03')
    expect(parseDate('3 नवंबर', TODAY)).toBe('2026-11-03')
    expect(parseDate('31/02', TODAY)).toBeNull()
    expect(parseDate('soon', TODAY)).toBeNull()
    expect(parseYesNo('Yes')).toBe(true)
    expect(parseYesNo('हाँ')).toBe(true)
    expect(parseYesNo('nahi')).toBe(false)
    expect(parseYesNo('maybe')).toBeNull()
    expect(parseChoice('2', 3)).toBe(1)
    expect(parseChoice('4', 3)).toBeNull()
  })
})

describe('guided leave application', () => {
  const types = [{ id: 't1', name: 'Casual leave' }, { id: 't2', name: 'Sick leave' }]

  it('walks type → dates → reason → confirm and hands back what to submit', () => {
    const start = startLeaveFlow(types, 'en')
    expect(start.reply).toMatch(/1 Casual leave\n2 Sick leave/)
    let data = start.next!.data
    const steps: [string, string][] = [['type', '2'], ['start', '12 Oct'], ['end', '13/10'], ['reason', 'Fever, doctor advised rest']]
    for (const [step, text] of steps) {
      const out = advanceLeaveFlow(step as 'type', data, text, { today: TODAY, lang: 'en' })
      expect(out.next).not.toBeNull()
      data = out.next!.data
    }
    const done = advanceLeaveFlow('confirm', data, 'yes', { today: TODAY, lang: 'en' })
    expect(done.next).toBeNull()
    expect(done.submit).toEqual({ leaveTypeId: 't2', startDate: '2026-10-12', endDate: '2026-10-13', reason: 'Fever, doctor advised rest', isHalfDay: false })
  })

  it('asks again on a bad answer, refuses an end before the start, and stops on cancel or no', () => {
    const data: LeaveFlowData = { types, typeId: 't1', typeName: 'Casual leave', start: '2026-10-12' }
    expect(advanceLeaveFlow('type', { types }, '9', { today: TODAY, lang: 'en' }).next?.step).toBe('type')
    expect(advanceLeaveFlow('start', data, 'someday', { today: TODAY, lang: 'hi' }).reply).toMatch(/तारीख/)
    expect(advanceLeaveFlow('end', data, '10 Oct', { today: TODAY, lang: 'en' }).next?.step).toBe('end')
    expect(advanceLeaveFlow('end', data, 'same', { today: TODAY, lang: 'en' }).next?.data.end).toBe('2026-10-12')
    expect(advanceLeaveFlow('reason', data, 'exit', { today: TODAY, lang: 'en' }).next).toBeNull()
    const no = advanceLeaveFlow('confirm', { ...data, end: '2026-10-12', reason: 'Family function' }, 'नहीं', { today: TODAY, lang: 'hi' })
    expect(no.next).toBeNull()
    expect(no.submit).toBeUndefined()
  })
})

describe('who the bot answers', () => {
  const on: BotWorkspace = { connected: true, mode: 'byo', botEnabled: true }
  const verified = new Date('2026-09-01')
  const person = (over: Partial<BotPerson> = {}): BotPerson => ({ memberActive: true, employeeLinked: true, user: { id: 'u1', phone: '+919876543210', phoneVerifiedAt: verified, whatsapp: { optedInAt: verified, optedOutAt: null } }, ...over })

  it('answers a verified, opted-in employee of a connected BYO workspace with the bot on', () => {
    expect(botAccess(on, person())).toEqual({ ok: true })
  })

  it('stays quiet otherwise', () => {
    expect(botAccess({ ...on, botEnabled: false }, person())).toEqual({ ok: false, reason: 'bot_off' })
    expect(botAccess({ ...on, connected: false }, person())).toEqual({ ok: false, reason: 'bot_off' })
    expect(botAccess({ ...on, mode: 'managed' }, person())).toEqual({ ok: false, reason: 'not_byo' })
    expect(botAccess(on, null)).toEqual({ ok: false, reason: 'not_member' })
    expect(botAccess(on, person({ memberActive: false }))).toEqual({ ok: false, reason: 'not_member' })
    expect(botAccess(on, person({ user: { id: 'u1', phone: '+919876543210', phoneVerifiedAt: null, whatsapp: { optedInAt: verified } } }))).toEqual({ ok: false, reason: 'not_verified' })
    expect(botAccess(on, person({ user: { id: 'u1', phone: '+919876543210', phoneVerifiedAt: verified, whatsapp: { optedInAt: verified, optedOutAt: new Date('2026-09-20') } } }))).toEqual({ ok: false, reason: 'not_verified' })
    expect(botAccess(on, person({ employeeLinked: false }))).toEqual({ ok: false, reason: 'not_linked' })
  })
})
