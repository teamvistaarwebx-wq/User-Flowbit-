import { describe, expect, it } from 'vitest'
import { editDistance, prefilterStems, rankMatches, resolve, scoreCandidate, type Candidate } from './match'

const people: Candidate[] = [
  { kind: 'member', id: 'm1', name: 'Vikram Joshi', aliases: ['vikram@vistaar.in', '+91 98765 43210'] },
  { kind: 'member', id: 'm2', name: 'Vikas Rao', aliases: ['vikas@vistaar.in'] },
  { kind: 'member', id: 'm3', name: 'Priya Sharma', aliases: ['priya@vistaar.in'] },
]
const clients: Candidate[] = [
  { kind: 'client', id: 'c1', name: 'Kalpa Studio' },
  { kind: 'client', id: 'c2', name: 'Kalpa Foods' },
  { kind: 'client', id: 'c3', name: 'Acme Corp' },
]

describe('find matcher', () => {
  it('matches a first name with high confidence', () => {
    const [top] = rankMatches('Vikram', people)
    expect(top.id).toBe('m1')
    expect(top.confidence).toBeGreaterThanOrEqual(0.8)
    expect(resolve(rankMatches('Vikram', people)).status).toBe('sure')
  })

  it('matches emails and phones exactly, never fuzzily', () => {
    expect(scoreCandidate('vikram@vistaar.in', people[0]).confidence).toBe(1)
    expect(scoreCandidate('vikram@vistaar.co', people[0]).confidence).toBe(0)
    expect(scoreCandidate('9876543210', people[0]).confidence).toBe(1)
    expect(scoreCandidate('9876543211', people[0]).confidence).toBe(0)
  })

  it('flags two close matches as ambiguous', () => {
    const r = resolve(rankMatches('Kalpa', clients))
    expect(r.status).toBe('ambiguous')
    if (r.status === 'ambiguous') expect(r.others.map((o) => o.id)).toContain(r.match.id === 'c1' ? 'c2' : 'c1')
    expect(resolve(rankMatches('Kalpa Studio', clients))).toMatchObject({ status: 'sure', match: { id: 'c1' } })
  })

  it('forgives small typos with lower confidence', () => {
    const [top] = rankMatches('Priyaa', people)
    expect(top.id).toBe('m3')
    expect(top.confidence).toBeLessThan(0.8)
    expect(top.confidence).toBeGreaterThan(0.45)
  })

  it('returns nothing for unrelated names', () => {
    expect(rankMatches('Zebra Holdings', clients)).toEqual([])
    expect(resolve([])).toEqual({ status: 'none' })
  })

  it('matches task keys and project codes as aliases', () => {
    const tasks: Candidate[] = [{ kind: 'task', id: 't1', name: 'Homepage banner revisions', aliases: ['VW-42'] }]
    expect(rankMatches('VW-42', tasks)[0].confidence).toBe(1)
    expect(rankMatches('the homepage banner', tasks)[0]?.id).toBe('t1')
  })

  it('computes edit distance and stems', () => {
    expect(editDistance('kitten', 'sitting')).toBe(3)
    expect(prefilterStems('Kalpa Studio')).toEqual(['kal', 'stu'])
    expect(prefilterStems('a@b.in')).toEqual([])
  })
})

describe('filler words', () => {
  it('ignores "the … task" around a name', () => {
    const tasks: Candidate[] = [{ kind: 'task', id: 't1', name: 'Homepage banner' }, { kind: 'task', id: 't2', name: 'Print vendor quotes' }]
    expect(resolve(rankMatches('the homepage task', tasks))).toMatchObject({ status: 'sure', match: { id: 't1' } })
  })
})
