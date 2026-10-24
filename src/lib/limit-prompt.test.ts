import { describe, expect, it } from 'vitest'
import { FreeSeatLimitError, UserError } from './errors'
import { limitPromptOf, openLimitPrompt, registerLimitPrompt, type LimitPromptDetail } from './limit-prompt'

describe('seat-limit prompt', () => {
  it('turns a Free seat-limit refusal into the Upgrade / Start trial prompt', () => {
    expect(limitPromptOf({ ok: false, error: 'The Free plan covers 5 people.', code: 'free_seat_limit' })).toEqual({ message: 'The Free plan covers 5 people.', trialAvailable: true })
    expect(limitPromptOf({ ok: false, error: 'x', code: 'free_seat_limit_no_trial' })?.trialAvailable).toBe(false)
  })

  it('leaves other results to the toast', () => {
    expect(limitPromptOf({ ok: false, error: 'Some fields need attention.' })).toBeNull()
    expect(limitPromptOf({ ok: true })).toBeNull()
  })

  it('opens the mounted prompt, and falls back to the toast when none is mounted', () => {
    const refused = { ok: false as const, error: 'x', code: 'free_seat_limit' as const }
    expect(openLimitPrompt(refused)).toBe(false)
    const seen: LimitPromptDetail[] = []
    const off = registerLimitPrompt((d) => seen.push(d))
    expect(openLimitPrompt(refused)).toBe(true)
    expect(openLimitPrompt({ ok: false, error: 'other' })).toBe(false)
    off()
    expect(openLimitPrompt(refused)).toBe(false)
    expect(seen).toEqual([{ message: 'x', trialAvailable: true }])
  })

  it('FreeSeatLimitError carries the code the client reads', () => {
    expect(new FreeSeatLimitError('m', true).code).toBe('free_seat_limit')
    expect(new FreeSeatLimitError('m', false).code).toBe('free_seat_limit_no_trial')
    expect(new FreeSeatLimitError('m', true)).toBeInstanceOf(UserError)
    expect(new UserError('m').code).toBeUndefined()
  })
})
