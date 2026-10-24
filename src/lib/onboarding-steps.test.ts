import { describe, expect, it } from 'vitest'
import { dueOnboardingStep, onboardingKey } from './onboarding-steps'

const SIGNUP = new Date('2026-10-01T05:00:00Z')
const DAY = 86_400_000
const ALL = ['work', 'muster', 'orbit', 'folio'] as const
const at = (days: number) => new Date(SIGNUP.getTime() + days * DAY + 3_600_000)
const due = (days: number, done: string[] = [], products: readonly ('work' | 'muster' | 'orbit' | 'folio')[] = ALL) => dueOnboardingStep({ createdAt: SIGNUP, now: at(days), done: new Set(done), products })?.day ?? null

describe('onboarding emails (Day 1, 3, 7)', () => {
  it('sends each on its day, with a day to catch up, and nothing in between or after', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => due(d))).toEqual([null, 1, 1, 3, 3, null, null, 7, 7, null])
  })

  it('skips a step that is already done (UsageEvent kinds)', () => {
    expect(due(1, ['task_created'])).toBeNull()
    expect(due(3, ['attendance_marked'])).toBeNull()
    expect(due(7, ['invoice_issued'])).toBeNull()
    expect(due(7, ['task_created'])).toBe(7)
  })

  it('skips a step whose product is switched off', () => {
    expect(due(3, [], ['work', 'folio'])).toBeNull()
  })

  it('has one dedupe key per day', () => {
    expect(new Set([1, 3, 7].map((d) => onboardingKey(d as 1 | 3 | 7))).size).toBe(3)
  })
})
