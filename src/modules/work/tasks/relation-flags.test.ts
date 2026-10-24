import { describe, expect, it } from 'vitest'
import { closesLoop, openBlockersNote, otherEndAccess, relationFlags } from './relation-flags'

describe('relationFlags', () => {
  it('has no flags without relations', () => {
    expect(relationFlags('todo', [], [])).toEqual({ blockedBy: null, blocking: null })
  })

  it('is orange-blocked while a blocker is open and green once all are done', () => {
    expect(relationFlags('todo', ['done', 'in_progress'], []).blockedBy).toBe('open')
    expect(relationFlags('todo', ['done', 'done'], []).blockedBy).toBe('clear')
  })

  it('is red-blocking while it holds up open work and green once it is done', () => {
    expect(relationFlags('in_progress', [], ['todo']).blocking).toBe('open')
    expect(relationFlags('done', [], ['todo']).blocking).toBe('clear')
    expect(relationFlags('todo', [], ['done']).blocking).toBe('clear')
  })
})

describe('closesLoop', () => {
  const blockersOf = new Map([['a', ['b']], ['b', ['c']]])

  it('refuses a task blocking itself', () => {
    expect(closesLoop('a', 'a', blockersOf)).toBe(true)
  })

  it('finds a loop through other tasks', () => {
    // c blocked by a, while a is blocked by b and b by c.
    expect(closesLoop('c', 'a', blockersOf)).toBe(true)
  })

  it('allows a chain without a loop', () => {
    expect(closesLoop('a', 'd', blockersOf)).toBe(false)
  })
})

describe('openBlockersNote', () => {
  it('says nothing when no blocker is open', () => {
    expect(openBlockersNote([])).toBeUndefined()
  })

  it('names one, two, or the first two and a count', () => {
    expect(openBlockersNote(['VW-12'])).toBe('VW-12 is still open')
    expect(openBlockersNote(['VW-12', 'VW-13'])).toBe('VW-12 and VW-13 are still open')
    expect(openBlockersNote(['VW-12', 'VW-13', 'VW-14', 'VW-15'])).toBe('VW-12, VW-13 and 2 more are still open')
  })
})

describe('otherEndAccess', () => {
  it('needs edit access on the other task only when the link is written onto it', () => {
    expect(otherEndAccess('blocks')).toBe('edit')
    expect(otherEndAccess('blocked_by')).toBe('view')
    expect(otherEndAccess('related')).toBe('view')
  })
})
