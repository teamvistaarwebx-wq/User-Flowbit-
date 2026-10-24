import { describe, expect, it } from 'vitest'
import { canTransition, DIRECTORY_STATUSES, hasLeft, isOnPayroll, PAYROLL_STATUSES, statusesByStage, transitionProblems, workModeOf } from './lifecycle'

describe('work mode', () => {
  it('counts a record without one, or with anything unknown, as office', () => {
    expect(workModeOf('remote')).toBe('remote')
    expect(workModeOf('office')).toBe('office')
    expect(workModeOf(undefined)).toBe('office')
    expect(workModeOf(null)).toBe('office')
    expect(workModeOf('hybrid')).toBe('office')
  })
})

describe('lifecycle predicates', () => {
  it('keeps people serving notice in the directory and on payroll', () => {
    expect(DIRECTORY_STATUSES).toContain('notice_period')
    expect(isOnPayroll('resigned')).toBe(true)
  })

  it('takes terminated and ended people off payroll', () => {
    expect(PAYROLL_STATUSES).not.toContain('terminated')
    expect(hasLeft('terminated')).toBe(true)
    expect(hasLeft('exited')).toBe(true)
    expect(hasLeft('probation')).toBe(false)
  })

  it('groups all 13 statuses into four stages', () => {
    const groups = statusesByStage()
    expect(groups.map((g) => g.stage)).toEqual(['pre_joining', 'working', 'leaving', 'ended'])
    expect(groups.flatMap((g) => g.statuses)).toHaveLength(13)
  })
})

describe('transitions', () => {
  it('allows probation to confirmed and refuses exited to active', () => {
    expect(canTransition('probation', 'confirmed')).toBe(true)
    expect(canTransition('exited', 'active')).toBe(false)
  })

  it('lets a resignation be withdrawn', () => {
    expect(canTransition('notice_period', 'confirmed')).toBe(true)
    expect(canTransition('resigned', 'active')).toBe(true)
  })

  it('treats staying put as allowed', () => {
    expect(transitionProblems({ from: 'active', to: 'active' })).toBeNull()
  })

  it('explains a refused move with the allowed targets', () => {
    const problems = transitionProblems({ from: 'candidate', to: 'active' })
    expect(problems?.status).toContain('Candidate can move to Offered, Inactive')
  })

  it('says a final status cannot move', () => {
    expect(transitionProblems({ from: 'exited', to: 'active' })?.status).toContain('final')
  })

  it('needs a last working day and reason to exit', () => {
    expect(transitionProblems({ from: 'notice_period', to: 'exited' })).toEqual({ exitDate: 'Enter the last working day.', reason: 'Say why they are leaving.' })
    expect(transitionProblems({ from: 'notice_period', to: 'exited', exitDate: '2026-10-31', reason: 'Moved city' })).toBeNull()
  })

  it('needs a resignation date for notice', () => {
    expect(transitionProblems({ from: 'confirmed', to: 'notice_period' })?.resignationDate).toBeDefined()
    expect(transitionProblems({ from: 'confirmed', to: 'notice_period', resignationDate: '2026-10-01' })).toBeNull()
  })
})
