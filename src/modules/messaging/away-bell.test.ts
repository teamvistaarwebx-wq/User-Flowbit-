import { describe, expect, it } from 'vitest'
import { istInstant } from '@/lib/dates'
import { groupBell, groupTitle, objectKey, type BellItem } from '@/modules/settings/bell'
import { holdUntil, offDatesOf } from './away'

describe('leave-day and holiday hold', () => {
  const now = istInstant('2026-10-08', '11:00')

  it('sends now on a working day', () => {
    expect(holdUntil(now, offDatesOf(['2026-10-12'], ['2026-10-20']))).toBeNull()
  })

  it('holds until 09:00 on the first day back after leave and holidays that run together', () => {
    const off = offDatesOf(['2026-10-08', '2026-10-09'], ['2026-10-10'])
    expect(holdUntil(now, off)?.toISOString()).toBe(istInstant('2026-10-11', '09:00').toISOString())
  })

  it('holds on a company holiday too', () => {
    expect(holdUntil(now, offDatesOf([], ['2026-10-08']))?.toISOString()).toBe(istInstant('2026-10-09', '09:00').toISOString())
  })
})

describe('bell grouping', () => {
  const item = (id: string, href: string | null, minute: number, read = false): BellItem => ({ id, title: `'Homepage copy' update ${id}`, href, kind: 'info', createdAt: `2026-10-08T06:${String(minute).padStart(2, '0')}:00.000Z`, readAt: read ? '2026-10-08T07:00:00.000Z' : null })

  it('groups alerts about one object, newest first, and counts the unread', () => {
    const groups = groupBell([item('a', '/app/work/tasks/1', 1), item('b', '/app/work/tasks/1#comment-9', 5, true), item('c', '/app/hr/leave', 3), item('d', '/app/work/tasks/1?tab=x', 7), item('e', null, 2), item('f', null, 4)])
    expect(groups.map((g) => [g.key, g.count, g.unread])).toEqual([
      ['/app/work/tasks/1', 3, 2],
      ['id:f', 1, 1],
      ['/app/hr/leave', 1, 1],
      ['id:e', 1, 1],
    ])
    expect(groups[0].latest.id).toBe('d')
    expect(groupTitle(groups[0])).toBe("3 updates on 'Homepage copy'")
    expect(groupTitle(groups[2])).toBe(groups[2].latest.title)
  })

  it('shows only unread alerts under Unread', () => {
    const groups = groupBell([item('a', '/x', 1, true), item('b', '/x', 2), item('c', '/y', 3, true)], 'unread')
    expect(groups.map((g) => [g.key, g.count])).toEqual([['/x', 1]])
  })

  it('reads the object from the link only', () => {
    expect(objectKey('/app/work/tasks/1/#c')).toBe('/app/work/tasks/1')
    expect(objectKey('https://evil.example/x')).toBeNull()
    expect(objectKey(undefined)).toBeNull()
  })
})
