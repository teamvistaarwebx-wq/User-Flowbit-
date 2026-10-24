'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { action, fail, ok } from '@/lib/actions'
import { audit } from '@/lib/audit'
import type { Ctx } from '@/lib/ctx'
import { NotFoundError } from '@/lib/errors'
import { notifyMembers } from '@/lib/notify'
import { escapeRegex, pluralize } from '@/lib/utils'
import { checkbox, listOf, objectId, optionalText, requiredText } from '@/lib/validation'
import { TEAM_VIEWS, User } from '@/models/User'
import { Team } from '@/models/work/Team'
import { joinRefusal } from './join-rules'
import { assertActiveMembers } from './people'

const W = { product: 'work' } as const
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color must be a valid hex color').optional()

const refresh = (id?: string) => {
  revalidatePath('/app/work/teams')
  if (id) revalidatePath(`/app/work/teams/${id}`)
  revalidatePath('/app', 'layout')
}

async function loadTeam(ctx: Ctx, id: string) {
  const team = await ctx.db(Team).findById(id).lean()
  if (!team) throw new NotFoundError('That team')
  return team
}

async function nameTaken(ctx: Ctx, name: string, exceptId?: string) {
  const clash = await ctx.db(Team).findOne({ name: new RegExp(`^${escapeRegex(name)}$`, 'i'), ...(exceptId ? { _id: { $ne: exceptId } } : {}) }, { _id: 1 }).lean()
  return Boolean(clash)
}

export const createTeam = action(
  z.object({ name: requiredText('Team name', 100), description: optionalText(500), color, isPrivate: checkbox, memberIds: listOf(objectId), leadId: objectId.optional() }),
  async (input, ctx) => {
    if (await nameTaken(ctx, input.name)) return fail('Some fields need attention.', { name: 'Team name already exists' })
    const ids = [...new Set([...input.memberIds, ...(input.leadId ? [input.leadId] : [])])]
    await assertActiveMembers(ctx, ids)
    const now = new Date()
    const team = await ctx.db(Team).create({
      name: input.name,
      description: input.description,
      color: input.color ?? '#C084FC',
      isPrivate: input.isPrivate,
      createdById: ctx.memberId,
      members: ids.map((memberId) => ({ memberId, role: memberId === input.leadId ? 'lead' : 'member', addedById: ctx.memberId, joinedAt: now })),
    })
    await notifyMembers(ctx, ids, { title: `${ctx.user.name} added you to the team '${team.name}'`, href: `/app/work/teams/${team._id}`, kind: 'info', product: 'work', event: 'team.member_added' })
    await audit(ctx, { action: 'team.created', entity: 'Team', entityId: team._id, summary: `Created team ${team.name}`, product: 'work' })
    refresh()
    return ok(`Team '${team.name}' created`, { id: String(team._id) }, `/app/work/teams/${team._id}`)
  },
  { ...W, perm: 'teams.manage' },
)

export const updateTeam = action(
  z.object({ id: objectId, name: requiredText('Team name', 100), description: optionalText(500), color, isPrivate: checkbox }),
  async (input, ctx) => {
    const team = await loadTeam(ctx, input.id)
    if (await nameTaken(ctx, input.name, input.id)) return fail('Some fields need attention.', { name: 'Team name already exists' })
    await ctx.db(Team).updateOne({ _id: team._id }, { $set: { name: input.name, description: input.description ?? '', isPrivate: input.isPrivate, ...(input.color ? { color: input.color } : {}) } })
    refresh(input.id)
    return ok(`Team '${input.name}' saved`)
  },
  { ...W, perm: 'teams.manage' },
)

export const deleteTeam = action(
  z.object({ id: objectId }),
  async ({ id }, ctx) => {
    const team = await loadTeam(ctx, id)
    await ctx.db(Team).deleteOne({ _id: team._id })
    await audit(ctx, { action: 'team.deleted', entity: 'Team', entityId: team._id, summary: `Deleted team ${team.name} (${pluralize(team.members.length, 'member')})`, product: 'work' })
    refresh()
    return ok(`Team '${team.name}' deleted`, undefined, '/app/work/teams')
  },
  { ...W, perm: 'teams.manage' },
)

export const addTeamMembers = action(
  z.object({ id: objectId, memberIds: listOf(objectId).refine((v) => v.length > 0, 'Pick at least one person') }),
  async ({ id, memberIds }, ctx) => {
    const team = await loadTeam(ctx, id)
    const existing = new Set(team.members.map((m) => String(m.memberId)))
    const fresh = [...new Set(memberIds)].filter((m) => !existing.has(m))
    if (!fresh.length) return fail('Everyone you picked is already in this team.')
    await assertActiveMembers(ctx, fresh)
    const now = new Date()
    await ctx.db(Team).updateOne({ _id: team._id }, { $push: { members: { $each: fresh.map((memberId) => ({ memberId, role: 'member', addedById: ctx.memberId, joinedAt: now })) } } })
    await notifyMembers(ctx, fresh, { title: `${ctx.user.name} added you to the team '${team.name}'`, href: `/app/work/teams/${team._id}`, kind: 'info', product: 'work', event: 'team.member_added' })
    refresh(id)
    return ok(`Added ${pluralize(fresh.length, 'person', 'people')} to ${team.name}`)
  },
  { ...W, perm: 'teams.manage' },
)

export const removeTeamMember = action(
  z.object({ id: objectId, memberId: objectId }),
  async ({ id, memberId }, ctx) => {
    const team = await loadTeam(ctx, id)
    if (memberId !== String(ctx.memberId)) ctx.assert('teams.manage')
    if (!team.members.some((m) => String(m.memberId) === memberId)) return fail("That person isn't in this team.")
    await ctx.db(Team).updateOne({ _id: team._id }, { $pull: { members: { memberId } } })
    refresh(id)
    return ok(memberId === String(ctx.memberId) ? `You left ${team.name}` : `Removed from ${team.name}`)
  },
  W,
)

export const setTeamRole = action(
  z.object({ id: objectId, memberId: objectId, role: z.enum(['lead', 'member']) }),
  async ({ id, memberId, role }, ctx) => {
    const team = await loadTeam(ctx, id)
    if (!team.members.some((m) => String(m.memberId) === memberId)) return fail("That person isn't in this team.")
    const lead = team.members.find((m) => m.role === 'lead')
    if (role === 'lead' && lead && String(lead.memberId) !== memberId) return fail('This team already has a lead. Make them a member first.')
    await ctx.db(Team).updateOne({ _id: team._id, 'members.memberId': memberId }, { $set: { 'members.$.role': role } })
    if (role === 'lead') await notifyMembers(ctx, [memberId], { title: `You now lead the team '${team.name}'`, href: `/app/work/teams/${team._id}`, kind: 'info', product: 'work', event: 'team.lead_set' })
    refresh(id)
    return ok(role === 'lead' ? 'Team lead set' : 'Changed to member')
  },
  { ...W, perm: 'teams.manage' },
)

export const joinTeam = action(
  z.object({ id: objectId }),
  async ({ id }, ctx) => {
    const team = await loadTeam(ctx, id)
    const refusal = joinRefusal(team, String(ctx.memberId))
    if (refusal) return fail(refusal)
    // The filter repeats the checks, so a team made invite only a moment ago is not joined.
    const joined = await ctx.db(Team).updateOne(
      { _id: team._id, isActive: { $ne: false }, isPrivate: { $ne: true }, 'members.memberId': { $ne: ctx.memberId } },
      { $push: { members: { memberId: ctx.memberId, role: 'member', joinedAt: new Date() } } },
    )
    if (!joined.modifiedCount) return fail('Could not join this team. Refresh and try again.')
    refresh(id)
    return ok(`You joined ${team.name}`)
  },
  W,
)

/** Teams → members: cards or list, remembered on the person (works while read-only). */
export const setTeamView = action(
  z.object({ view: z.enum(TEAM_VIEWS) }),
  async ({ view }, ctx) => {
    await User.updateOne({ _id: ctx.userId }, { $set: { 'prefs.teamView': view } })
    return ok()
  },
  { ...W, allowReadOnly: true },
)
