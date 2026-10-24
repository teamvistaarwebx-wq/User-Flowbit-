import { describe, expect, it } from 'vitest'
import { autoPostDoc, autoPostKey } from './feed-post'
import { RECIPES } from './recipes'
import { occurrenceIn, datesBetween } from './sources/people-dates'

describe('automatic celebration and welcome posts', () => {
  it('ships birthday, anniversary and welcome posts switched on by default', () => {
    const posts = RECIPES.filter((r) => r.spec.actions.some((a) => a.type === 'post'))
    expect(posts.map((r) => [r.key, r.defaultEnabled, r.spec.trigger.source])).toEqual([
      ['birthday_post', true, 'employee_birthday'],
      ['anniversary_post', true, 'employee_anniversary'],
      ['welcome_post', true, 'employee_joining'],
    ])
  })

  it('keys one post per recipe, person and year (a recreated rule cannot post twice)', () => {
    const thisYear = autoPostKey('birthday_post', 'rule1:Employee:e1:2026', 'run1')
    expect(thisYear).toBe('birthday_post:Employee:e1:2026')
    expect(autoPostKey('birthday_post', 'rule2:Employee:e1:2026', 'run2')).toBe(thisYear)
    expect(autoPostKey('birthday_post', 'rule1:Employee:e1:2027', 'run3')).not.toBe(thisYear)
    expect(autoPostKey('anniversary_post', 'rule1:Employee:e1:2026', 'run1')).not.toBe(thisYear)
    expect(autoPostKey(null, null, 'run9')).toBe('custom:run:run9')
  })

  it('builds a celebration post about the person, visible to everyone', () => {
    const now = new Date('2026-10-09T03:30:00Z')
    const doc = autoPostDoc({ type: 'celebration', title: ' Happy birthday, Asha! ', message: 'Wishes below', authorId: 'owner', featuredId: 'm1', key: 'k', now })
    expect(doc).toMatchObject({ category: 'celebration', title: 'Happy birthday, Asha!', audience: 'org', featuredIds: ['m1'], autoKey: 'k', published: true, authorId: 'owner' })
    expect(autoPostDoc({ type: 'welcome', title: '', message: '', authorId: 'o', key: 'k', now })).toMatchObject({ title: 'Welcome to the team', message: 'Welcome to the team', featuredIds: [] })
  })

  it('finds the birthday inside the scan window, 29 Feb on 28 Feb in other years', () => {
    expect(occurrenceIn('1994-10-09', datesBetween('2026-10-08', '2026-10-10'))).toBe('2026-10-09')
    expect(occurrenceIn('2000-02-29', ['2027-02-28'])).toBe('2027-02-28')
    expect(occurrenceIn('1994-10-12', ['2026-10-09'])).toBeNull()
  })
})
