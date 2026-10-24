'use server'

import { isValidObjectId } from 'mongoose'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { action, fail, ok } from '@/lib/actions'
import { audit } from '@/lib/audit'
import type { Ctx } from '@/lib/ctx'
import { formatDate, istInstant, todayIST } from '@/lib/dates'
import { ForbiddenError, NotFoundError } from '@/lib/errors'
import { notifyMembers } from '@/lib/notify'
import { objectId, optionalText } from '@/lib/validation'
import { recordUsage } from '@/lib/usage'
import { Activity } from '@/models/orbit/Activity'
import { ACTIVITY_DONE_LABEL, ACTIVITY_LABEL, BACKDATE_DAYS, defaultChannel, type ActivityType, type LeadStage } from './constants'
import { refreshNextFollowUp } from './next-step'
import { exitForActivity } from './sequences/rules'
import { exitLeadEnrollments } from './sequences/store'
import { assertActiveMembers } from './people'
import { resolveRelated, touchRelated, unlockedStage, type Related } from './related'
import { logActivitySchema, optDate, optTime, scheduleActivitySchema } from './schemas'
import { canEditDeal, canEditLead, isMe, loadDeal, loadLead } from './scope'
import { getOrbitSettings, isWarmSource } from './settings'

const O = { product: 'orbit' } as const
const DAY_MS = 86_400_000

function refresh(rel: { leadId?: unknown; dealId?: unknown; clientId?: unknown }) {
  revalidatePath('/app/orbit')
  revalidatePath('/app/orbit/activities')
  if (rel.leadId) revalidatePath(`/app/orbit/leads/${rel.leadId}`)
  if (rel.dealId) revalidatePath(`/app/orbit/deals/${rel.dealId}`)
  if (rel.clientId) revalidatePath(`/app/clients/${rel.clientId}`)
}

/** 'YYYY-MM-DDTHH:mm' (IST) -> Date within the last 7 days, or a field error. */
function parseOccurred(value: string | undefined, now: Date): Date | { error: string } {
  if (!value) return now
  const at = istInstant(value.slice(0, 10), value.slice(11, 16))
  if (at.getTime() > now.getTime() + 60_000) return { error: "Pick a time that isn't in the future" }
  if (at.getTime() < now.getTime() - BACKDATE_DAYS * DAY_MS) return { error: `Pick a time in the last ${BACKDATE_DAYS} days` }
  return at
}

async function unlocks(ctx: Ctx, rel: Related, type: Parameters<typeof unlockedStage>[1]): Promise<LeadStage | null> {
  if (!rel.lead) return null
  const cfg = await getOrbitSettings(ctx)
  return unlockedStage(rel.lead.stage as LeadStage, type, isWarmSource(cfg, rel.lead.source))
}

async function createFollowUp(ctx: Ctx, rel: Related, f: { title?: string; type?: ActivityType; dueDate?: string; dueTime?: string } | undefined) {
  if (!f?.dueDate) return
  await ctx.db(Activity).create({ leadId: rel.leadId, dealId: rel.dealId, clientId: rel.clientId, contactId: rel.contactId, type: f.type ?? 'follow_up', status: 'planned', title: f.title ?? 'Follow up', dueDate: f.dueDate, dueTime: f.dueTime ?? null, assigneeId: rel.ownerId, createdBy: ctx.memberId })
}

export const logActivity = action(
  logActivitySchema,
  async (input, ctx) => {
    const rel = await resolveRelated(ctx, input)
    const now = new Date()
    const occurredAt = parseOccurred(input.occurredAt, now)
    if ('error' in occurredAt) return fail('Some fields need attention.', { occurredAt: occurredAt.error })
    if (input.type === 'meeting' && !input.notes) return fail('Some fields need attention.', { notes: 'Add what was discussed' })
    if (input.followUp?.dueDate && input.followUp.dueDate < todayIST()) return fail('Some fields need attention.', { 'followUp.dueDate': 'Pick today or a later date' })
    const next = await unlocks(ctx, rel, input.type)
    await ctx.db(Activity).create({
      leadId: rel.leadId, dealId: rel.dealId, clientId: rel.clientId, contactId: rel.contactId, type: input.type, status: 'done',
      channel: input.channel ?? defaultChannel(input.type, rel.lead?.source), notes: input.notes ?? '', occurredAt, assigneeId: ctx.memberId, createdBy: ctx.memberId,
    })
    await touchRelated(ctx, rel, occurredAt)
    // A logged reply stops the lead's follow-up sequence, as the Replied button does.
    const exitReason = exitForActivity(input.type)
    if (exitReason && rel.leadId) await exitLeadEnrollments(ctx, [rel.leadId], exitReason, now)
    await createFollowUp(ctx, rel, input.followUp)
    await refreshNextFollowUp(ctx, rel)
    refresh(rel)
recordUsage({ kind: 'lead_touched', orgId: ctx.orgId, userId: ctx.userId, product: 'orbit', meta: { via: 'activity' } })
    return ok(`${ACTIVITY_DONE_LABEL[input.type]} logged for '${rel.name}'`, { unlocks: next })
  },
  { ...O, perm: 'activities.write' },
)

export const scheduleActivity = action(
  scheduleActivitySchema,
  async (input, ctx) => {
    const rel = await resolveRelated(ctx, input)
    if (input.dueDate < todayIST()) return fail('Some fields need attention.', { dueDate: 'Pick today or a later date' })
    const assigneeId = input.assigneeId ?? String(rel.ownerId)
    const allowed = ctx.can('orbit.close') || isMe(ctx, assigneeId) || String(rel.ownerId) === assigneeId
    if (!allowed) return fail('Some fields need attention.', { assigneeId: 'Only a reviewer can assign follow-ups to someone else' })
    await assertActiveMembers(ctx, [assigneeId])
    await ctx.db(Activity).create({
      leadId: rel.leadId, dealId: rel.dealId, clientId: rel.clientId, contactId: rel.contactId, type: input.type, status: 'planned', title: input.title,
      dueDate: input.dueDate, dueTime: input.dueTime ?? null, meetingLink: input.type === 'meeting' ? (input.meetingLink ?? null) : null, notes: input.notes ?? '',
      assigneeId, createdBy: ctx.memberId,
    })
    await refreshNextFollowUp(ctx, rel)
    const due = formatDate(input.dueDate, { short: true })
    if (!isMe(ctx, assigneeId)) {
      await notifyMembers(ctx, [assigneeId], { title: `${ACTIVITY_LABEL[input.type]} '${input.title}' for ${rel.name} due ${due}`, href: '/app/orbit/activities', kind: 'assignment', product: 'orbit', event: 'orbit.followup_assigned' })
    }
    refresh(rel)
    return ok(`${ACTIVITY_LABEL[input.type]} scheduled for ${due}`)
  },
  { ...O, perm: 'activities.write' },
)

/** A planned activity the actor may work on (assignee, creator, or edit rights on its record). */
async function loadPlanned(ctx: Ctx, id: string) {
  if (!isValidObjectId(id)) throw new NotFoundError('That activity')
  const activity = await ctx.db(Activity).findById(id).lean()
  if (!activity) throw new NotFoundError('That activity')
  if (activity.status !== 'planned') return { activity, closed: true as const }
  if (isMe(ctx, activity.assigneeId) || isMe(ctx, activity.createdBy) || (ctx.can('orbit.view_all') && ctx.can('orbit.close'))) return { activity, closed: false as const }
  const lead = activity.leadId ? await loadLead(ctx, String(activity.leadId)).catch(() => null) : null
  const deal = activity.dealId ? await loadDeal(ctx, String(activity.dealId)).catch(() => null) : null
  if ((lead && canEditLead(ctx, lead)) || (deal && canEditDeal(ctx, deal))) return { activity, closed: false as const }
  throw new ForbiddenError('Only the assignee or the record owner can change this activity.')
}

export const completeActivity = action(
  z.object({ id: objectId, notes: optionalText(4000), occurredAt: logActivitySchema.shape.occurredAt }),
  async (input, ctx) => {
    const { activity, closed } = await loadPlanned(ctx, input.id)
    if (closed) return fail('This activity is already done or cancelled.')
    const notes = input.notes ?? activity.notes ?? ''
    if (activity.type === 'meeting' && !notes.trim()) return fail('Some fields need attention.', { notes: 'Add what was discussed' })
    const now = new Date()
    const occurredAt = parseOccurred(input.occurredAt, now)
    if ('error' in occurredAt) return fail('Some fields need attention.', { occurredAt: occurredAt.error })
    await ctx.db(Activity).updateOne({ _id: activity._id, status: 'planned' }, { $set: { status: 'done', notes, occurredAt, completedAt: now, assigneeId: ctx.memberId } })
    const rel = { leadId: activity.leadId ?? null, dealId: activity.dealId ?? null }
    await touchRelated(ctx, rel, occurredAt)
    await refreshNextFollowUp(ctx, rel)
    let next: LeadStage | null = null
    if (activity.leadId) {
      const lead = await loadLead(ctx, String(activity.leadId)).catch(() => null)
      const cfg = await getOrbitSettings(ctx)
      next = lead ? unlockedStage(lead.stage as LeadStage, activity.type, isWarmSource(cfg, lead.source)) : null
    }
    refresh({ ...rel, clientId: activity.clientId })
    return ok(`${ACTIVITY_DONE_LABEL[activity.type]}${activity.title ? `: ${activity.title}` : ''} marked done`, { unlocks: next })
  },
  { ...O, perm: 'activities.write' },
)

export const rescheduleActivity = action(
  z.object({ id: objectId, dueDate: optDate, dueTime: optTime }),
  async (input, ctx) => {
    if (!input.dueDate) return fail('Some fields need attention.', { dueDate: 'Pick a date' })
    if (input.dueDate < todayIST()) return fail('Some fields need attention.', { dueDate: 'Pick today or a later date' })
    const { activity, closed } = await loadPlanned(ctx, input.id)
    if (closed) return fail('Only planned activities can be rescheduled.')
    await ctx.db(Activity).updateOne({ _id: activity._id }, { $set: { dueDate: input.dueDate, dueTime: input.dueTime ?? null } })
    await refreshNextFollowUp(ctx, { leadId: activity.leadId, dealId: activity.dealId })
    refresh(activity)
    return ok(`Moved to ${formatDate(input.dueDate, { short: true })}`)
  },
  { ...O, perm: 'activities.write' },
)

export const cancelActivity = action(
  z.object({ id: objectId, reason: optionalText(200) }),
  async (input, ctx) => {
    const { activity, closed } = await loadPlanned(ctx, input.id)
    if (closed) return fail('Only planned activities can be cancelled.')
    await ctx.db(Activity).updateOne({ _id: activity._id }, { $set: { status: 'cancelled', cancelledAt: new Date(), cancelReason: input.reason ?? null } })
    await refreshNextFollowUp(ctx, { leadId: activity.leadId, dealId: activity.dealId })
    refresh(activity)
    return ok(`${ACTIVITY_LABEL[activity.type]} '${activity.title}' cancelled`)
  },
  { ...O, perm: 'activities.write' },
)

export const deleteActivity = action(
  z.object({ id: objectId }),
  async ({ id }, ctx) => {
    const activity = await ctx.db(Activity).findById(id).lean()
    if (!activity) return fail('That activity was not found. It may have been deleted already.')
    await ctx.db(Activity).deleteOne({ _id: activity._id })
    await refreshNextFollowUp(ctx, { leadId: activity.leadId, dealId: activity.dealId })
    await audit(ctx, { action: 'orbit.activity.delete', entity: 'Activity', entityId: activity._id, summary: `Deleted ${ACTIVITY_LABEL[activity.type].toLowerCase()} activity${activity.title ? ` '${activity.title}'` : ''}`, product: 'orbit', changes: { before: activity } })
    refresh(activity)
    return ok('Activity deleted')
  },
  { ...O, perm: 'orbit.settings' },
)
