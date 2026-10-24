import { describe, expect, it } from 'vitest'
import { groupByDay } from './agenda'

type Item = { id: string; day?: string | null }
const items: Item[] = [
  { id: 'a', day: '2026-10-09' },
  { id: 'b', day: '2026-10-02' },
  { id: 'c', day: null },
  { id: 'd', day: '2026-10-09' },
  { id: 'e', day: '2026-11-01' },
]

describe('groupByDay', () => {
  it('groups items by day in date order and keeps input order inside a day', () => {
    const groups = groupByDay(items, (i) => i.day)
    expect(groups.map((g) => g.date)).toEqual(['2026-10-02', '2026-10-09', '2026-11-01'])
    expect(groups[1].items.map((i) => i.id)).toEqual(['a', 'd'])
  })

  it('leaves out items without a day', () => {
    const ids = groupByDay(items, (i) => i.day).flatMap((g) => g.items.map((i) => i.id))
    expect(ids).not.toContain('c')
  })

  it('limits days to an inclusive range', () => {
    const groups = groupByDay(items, (i) => i.day, { from: '2026-10-01', to: '2026-10-31' })
    expect(groups.map((g) => g.date)).toEqual(['2026-10-02', '2026-10-09'])
  })

  it('returns every requested day, empty ones included, in the given order', () => {
    const groups = groupByDay(items, (i) => i.day, { days: ['2026-10-08', '2026-10-09'] })
    expect(groups).toEqual([
      { date: '2026-10-08', items: [] },
      { date: '2026-10-09', items: [items[0], items[3]] },
    ])
  })

  it('returns no groups for no items', () => {
    expect(groupByDay([], () => '2026-10-01')).toEqual([])
  })
})
