import { describe, expect, it } from 'vitest'
import { buildPollOptions, castVote, isPollClosed, pollView, type Poll } from './polls'

const now = new Date('2026-10-09T10:00:00Z')
const poll = (extra: Partial<Poll> = {}): Poll => ({
  options: [{ key: 'a', label: 'Thu', voterIds: [] }, { key: 'b', label: 'Fri', voterIds: [] }, { key: 'c', label: 'Sat', voterIds: [] }],
  multiple: false,
  anonymous: false,
  ...extra,
})
const voted = (p: Poll, member: string, keys: string[]) => {
  const r = castVote(p, member, keys, now)
  if (!r.ok) throw new Error(r.error)
  return r.poll
}

describe('building a poll', () => {
  it('trims, drops blanks and repeats, and keys the options', () => {
    const r = buildPollOptions([' Thu ', '', 'thu', 'Fri'])
    expect(r).toEqual({ ok: true, options: [{ key: 'a', label: 'Thu', voterIds: [] }, { key: 'b', label: 'Fri', voterIds: [] }] })
  })
  it('needs two to eight options', () => {
    expect(buildPollOptions(['Only one']).ok).toBe(false)
    expect(buildPollOptions(Array.from({ length: 9 }, (_, i) => `O${i}`)).ok).toBe(false)
  })
})

describe('voting', () => {
  it('single choice: one option, and a new vote replaces the old one', () => {
    expect(castVote(poll(), 'm1', ['a', 'b'], now)).toEqual({ ok: false, error: 'Pick one option.' })
    const once = voted(poll(), 'm1', ['a'])
    const changed = voted(once, 'm1', ['b'])
    expect(changed.options.map((o) => o.voterIds)).toEqual([[], ['m1'], []])
  })
  it('multiple choice: several options, still one vote per person per option', () => {
    const p = voted(voted(poll({ multiple: true }), 'm1', ['a', 'c', 'a']), 'm2', ['c'])
    expect(p.options.map((o) => o.voterIds)).toEqual([['m1'], [], ['m1', 'm2']])
  })
  it('withdraws with an empty vote and refuses unknown options', () => {
    expect(voted(voted(poll(), 'm1', ['a']), 'm1', []).options[0].voterIds).toEqual([])
    expect(castVote(poll(), 'm1', ['z'], now)).toEqual({ ok: false, error: 'That option is not in this poll.' })
  })
  it('refuses votes once closed by hand or by its close date', () => {
    expect(castVote(poll({ closedAt: new Date('2026-10-01') }), 'm1', ['a'], now).ok).toBe(false)
    expect(castVote(poll({ closesAt: new Date('2026-10-09T09:59:59Z') }), 'm1', ['a'], now).ok).toBe(false)
    expect(isPollClosed({ closesAt: new Date('2026-10-10') }, now)).toBe(false)
  })
  it('does not mutate the poll it was given', () => {
    const start = poll()
    voted(start, 'm1', ['a'])
    expect(start.options[0].voterIds).toEqual([])
  })
})

describe('results', () => {
  const names = (id: string) => ({ m1: 'Asha', m2: 'Ravi' })[id] ?? '?'
  it('shows counts, percentages of voters, my choice and names', () => {
    const p = voted(voted(poll({ multiple: true }), 'm1', ['a', 'b']), 'm2', ['a'])
    const view = pollView(p, 'm2', now, names)
    expect(view.voters).toBe(2)
    expect(view.mine).toEqual(['a'])
    expect(view.options.map((o) => [o.votes, o.percent, o.names])).toEqual([[2, 100, ['Asha', 'Ravi']], [1, 50, ['Asha']], [0, 0, []]])
  })
  it('never shows names in an anonymous poll', () => {
    const view = pollView(voted(poll({ anonymous: true }), 'm1', ['a']), 'author', now, names)
    expect(view.options[0]).toMatchObject({ votes: 1, names: [] })
  })
})
