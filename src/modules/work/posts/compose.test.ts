import { describe, expect, it } from 'vitest'
import { composePost, type ComposeInput } from './compose'
import { categoriesFor, pickableTypes, postTypeOf } from './post-types'

const now = new Date('2026-10-09T04:00:00Z')
const base: ComposeInput = { category: 'update', audience: 'org', targetRoles: [], targetTeamIds: [], targetDepartments: [], targetLocations: [], featuredIds: [], pollOptions: [], pollMultiple: false, pollAnonymous: false }

describe('post types', () => {
  it('reads the old categories as questions', () => {
    expect(postTypeOf('discussion')).toBe('question')
    expect(postTypeOf('idea')).toBe('question')
    expect(postTypeOf('announcement')).toBe('announcement')
    expect(postTypeOf(undefined)).toBe('update')
    expect(categoriesFor('question')).toEqual(['question', 'discussion', 'idea'])
  })
  it('keeps announcements and policies for moderators', () => {
    expect(pickableTypes(false)).not.toContain('policy')
    expect(pickableTypes(false)).not.toContain('announcement')
    expect(pickableTypes(true)).toContain('policy')
    expect(composePost({ ...base, category: 'policy' }, false, now)).toMatchObject({ ok: false, forbidden: expect.stringContaining('policy') })
  })
})

describe('composePost', () => {
  it('needs the people a kudos is for', () => {
    expect(composePost({ ...base, category: 'kudos' }, false, now)).toEqual({ ok: false, errors: { featuredIds: 'Pick who the kudos is for' } })
    expect(composePost({ ...base, category: 'kudos', featuredIds: ['a', 'a', 'b'] }, false, now)).toMatchObject({ ok: true, value: { featuredIds: ['a', 'b'] } })
  })
  it('builds a poll with its rules and close date', () => {
    const r = composePost({ ...base, category: 'poll', pollOptions: ['Yes', 'No'], pollAnonymous: true, pollClosesOn: '2026-10-12' }, false, now)
    expect(r.ok && r.value.poll).toMatchObject({ multiple: false, anonymous: true, closesAt: new Date('2026-10-12T18:29:59Z') })
    expect(composePost({ ...base, category: 'poll', pollOptions: ['Yes'] }, false, now)).toMatchObject({ ok: false, errors: { pollOptions: expect.any(String) } })
    expect(composePost({ ...base, category: 'poll', pollOptions: ['Yes', 'No'], pollClosesOn: '2026-10-01' }, false, now)).toMatchObject({ ok: false, errors: { pollClosesOn: expect.any(String) } })
  })
  it('targets groups, needing at least one', () => {
    expect(composePost({ ...base, audience: 'groups' }, false, now)).toMatchObject({ ok: false, errors: { targetTeamIds: expect.any(String) } })
    const r = composePost({ ...base, audience: 'groups', targetDepartments: [' Design ', 'Design'], targetRoles: ['manager'] }, false, now)
    expect(r.ok && r.value.audience).toEqual({ audience: 'groups', targetRoles: [], targetTeamIds: [], targetDepartments: ['Design'], targetLocations: [] })
  })
  it('schedules for later or refuses a bad time', () => {
    expect(composePost({ ...base, publishAt: '2026-10-10T09:00' }, false, now)).toMatchObject({ ok: true, value: { published: false, publishAt: new Date('2026-10-10T03:30:00Z') } })
    expect(composePost({ ...base, publishAt: '2027-03-01T09:00' }, false, now)).toMatchObject({ ok: false, errors: { publishAt: expect.any(String) } })
  })
  it('needs an event time', () => {
    expect(composePost({ ...base, category: 'event' }, false, now)).toMatchObject({ ok: false, errors: { eventAt: 'Pick when it happens' } })
    expect(composePost({ ...base, category: 'event', eventAt: '2026-10-20T17:00', eventPlace: ' Terrace ' }, false, now)).toMatchObject({ ok: true, value: { event: { startsAt: new Date('2026-10-20T11:30:00Z'), place: 'Terrace' } } })
  })
})
