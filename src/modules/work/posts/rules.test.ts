import { describe, expect, it } from 'vitest'
import { audienceMembers, canSeePost, inGroups, kudosManagers, postRecipients, reactionSummary, toggleReaction } from './rules'

const base = { authorId: 'a', audience: 'org', targetRoles: [] as string[], mentionIds: [] as string[] }

describe('canSeePost', () => {
  it('shows org posts to everyone', () => expect(canSeePost(base, { memberId: 'x', role: 'member', isModerator: false })).toBe(true))
  it('limits role posts to targeted roles, author and moderators', () => {
    const post = { ...base, audience: 'roles', targetRoles: ['manager'] }
    expect(canSeePost(post, { memberId: 'x', role: 'member', isModerator: false })).toBe(false)
    expect(canSeePost(post, { memberId: 'x', role: 'manager', isModerator: false })).toBe(true)
    expect(canSeePost(post, { memberId: 'a', role: 'member', isModerator: false })).toBe(true)
    expect(canSeePost(post, { memberId: 'y', role: 'member', isModerator: true })).toBe(true)
  })
  it('limits private posts to the author and mentioned people', () => {
    const post = { ...base, audience: 'private', mentionIds: ['m'] }
    expect(canSeePost(post, { memberId: 'm', role: 'member', isModerator: false })).toBe(true)
    expect(canSeePost(post, { memberId: 'z', role: 'admin', isModerator: false })).toBe(false)
  })
})

describe('toggleReaction', () => {
  it('adds, joins and removes without mutating', () => {
    const start = [{ emoji: '👍', memberIds: ['a'] }]
    const added = toggleReaction(start, '🎉', 'b')
    expect(added).toEqual([{ emoji: '👍', memberIds: ['a'] }, { emoji: '🎉', memberIds: ['b'] }])
    expect(toggleReaction(added, '👍', 'b')[0].memberIds).toEqual(['a', 'b'])
    expect(toggleReaction(start, '👍', 'a')).toEqual([])
    expect(start).toEqual([{ emoji: '👍', memberIds: ['a'] }])
  })
  it('summarises counts and my reaction', () => {
    expect(reactionSummary([{ emoji: '👍', memberIds: ['a', 'b'] }], 'b')).toEqual([{ emoji: '👍', count: 2, mine: true }])
  })
})

describe('recipients', () => {
  const members = [{ id: 'a', role: 'manager' }, { id: 'b', role: 'member' }, { id: 'c', role: 'manager' }]
  it('sends announcements to the audience minus the author, and mentions to the rest', () => {
    const post = { ...base, category: 'announcement', audience: 'roles', targetRoles: ['manager'], mentionIds: ['b', 'c'] }
    // b is not a manager but is mentioned, so the announcement reaches b as part of its audience
    expect(postRecipients(post, members)).toEqual({ audience: ['b', 'c'], mentioned: [], featured: [] })
  })
  it('only mentions for questions', () => {
    expect(postRecipients({ ...base, category: 'question', mentionIds: ['b', 'a'] }, members)).toEqual({ audience: [], mentioned: ['b'], featured: [] })
  })
  it('sends policies to the whole audience', () => {
    expect(postRecipients({ ...base, category: 'policy' }, members).audience).toEqual(['b', 'c'])
  })
  it('tells featured kudos people once, not again as mentioned', () => {
    expect(postRecipients({ ...base, category: 'kudos', featuredIds: ['b', 'b'], mentionIds: ['b', 'c'] }, members)).toEqual({ audience: [], mentioned: ['c'], featured: ['b'] })
  })
  it('counts the audience', () => expect(audienceMembers({ ...base, audience: 'roles', targetRoles: ['manager'] }, members).map((m) => m.id)).toEqual(['a', 'c']))
})

describe('audience targeting by group', () => {
  const groups = { teamIds: ['t1'], departments: ['Design'], locations: ['Pune'] }
  const post = { ...base, audience: 'groups', groups }
  const viewer = (extra: object) => ({ memberId: 'v', role: 'member', isModerator: false, ...extra })
  it('shows a group post to members of a targeted team, department or location', () => {
    expect(canSeePost(post, viewer({ teamIds: ['t9', 't1'] }))).toBe(true)
    expect(canSeePost(post, viewer({ department: ' design ' }))).toBe(true)
    expect(canSeePost(post, viewer({ location: 'PUNE' }))).toBe(true)
  })
  it('hides it from everyone else, but not from featured people or moderators', () => {
    expect(canSeePost(post, viewer({ teamIds: ['t2'], department: 'Sales', location: 'Mumbai' }))).toBe(false)
    expect(canSeePost(post, viewer({}))).toBe(false)
    expect(canSeePost({ ...post, featuredIds: ['v'] }, viewer({}))).toBe(true)
    expect(canSeePost(post, { ...viewer({}), isModerator: true })).toBe(true)
  })
  it('matches nothing without groups', () => expect(inGroups(undefined, { department: 'Design' })).toBe(false))
  it('counts the group audience', () => {
    const people = [{ id: 'a', role: 'member', department: 'Design' }, { id: 'b', role: 'member', teamIds: ['t1'] }, { id: 'c', role: 'member', location: 'Delhi' }]
    expect(audienceMembers(post, people).map((m) => m.id)).toEqual(['a', 'b'])
  })
})

describe('kudosManagers', () => {
  it('returns each featured person’s manager once, skipping the author and featured people', () => {
    const featured = [{ id: 'p1', managerId: 'm1' }, { id: 'p2', managerId: 'm1' }, { id: 'p3', managerId: 'p1' }, { id: 'p4', managerId: 'author' }, { id: 'p5' }]
    expect(kudosManagers(featured, 'author')).toEqual(['m1'])
  })
})
