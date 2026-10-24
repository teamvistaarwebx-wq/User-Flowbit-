'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { action, fail, ok } from '@/lib/actions'
import { audit } from '@/lib/audit'
import type { Ctx } from '@/lib/ctx'
import { NotFoundError, UserError } from '@/lib/errors'
import { pluralize } from '@/lib/utils'
import { listOf, objectId } from '@/lib/validation'
import { Activity } from '@/models/orbit/Activity'
import { Lead } from '@/models/orbit/Lead'
import { Sequence } from '@/models/orbit/Sequence'
import { SequenceEnrollment } from '@/models/orbit/SequenceEnrollment'
import { isOpenLead } from '../constants'
import { applyLeadMove } from '../lead-move'
import { canEditLead, leadAccess, loadLead } from '../scope'
import { getOrbitSettings } from '../settings'
import { changesStepOrder } from './rules'
import { sequenceSchema } from './schemas'
import { exitLeadEnrollments } from './store'

const O = { product: 'orbit', perm: 'leads.write' } as const
const BASE = '/app/orbit/sequences'
const MAX_BULK = 200

const refresh = (id?: string, leadId?: string) => {
  revalidatePath(BASE)
  if (id) revalidatePath(`${BASE}/${id}`)
  if (leadId) revalidatePath(`/app/orbit/leads/${leadId}`)
  revalidatePath('/app/orbit/leads')
}

/** The sequence, if this member may change it: its creator, or anyone who can close leads. */
async function editableSequence(ctx: Ctx, id: string) {
  const seq = await ctx.db(Sequence).findOne({ _id: id, archivedAt: null }).lean()
  if (!seq) throw new NotFoundError('That sequence')
  if (String(seq.createdBy) !== String(ctx.memberId) && !ctx.can('orbit.close')) throw new UserError('Only the person who made this sequence, or a reviewer, can change it.')
  return seq
}

export const saveSequence = action(
  sequenceSchema,
  async (input, ctx) => {
    const fields = { name: input.name, steps: input.steps, window: { startHour: input.startHour, endHour: input.endHour }, dailyCap: input.dailyCap }
    if (input.id) {
      const before = await editableSequence(ctx, input.id)
      if (changesStepOrder(before.steps ?? [], input.steps)) {
        const live = await ctx.db(SequenceEnrollment).countDocuments({ sequenceId: input.id, status: 'active' })
        if (live) return fail(`${pluralize(live, 'lead')} ${live === 1 ? 'is' : 'are'} in this sequence, so steps can't be added, removed or reordered (they would skip or repeat a step). Change the wording or waits, or make a new sequence.`)
      }
      await ctx.db(Sequence).updateOne({ _id: input.id }, { $set: fields })
      await audit(ctx, { action: 'orbit.sequence.updated', entity: 'Sequence', entityId: input.id, summary: `Updated sequence ${input.name}`, product: 'orbit' })
      refresh(input.id)
      return ok('Sequence saved. Leads already in it continue from their current step.')
    }
    const created = await ctx.db(Sequence).create({ ...fields, createdBy: ctx.memberId })
    await audit(ctx, { action: 'orbit.sequence.created', entity: 'Sequence', entityId: created._id, summary: `Created sequence ${input.name}`, product: 'orbit' })
    refresh()
    return ok('Sequence created', { id: String(created._id) }, `${BASE}/${created._id}`)
  },
  O,
)

export const archiveSequence = action(
  z.object({ id: objectId }),
  async ({ id }, ctx) => {
    const seq = await editableSequence(ctx, id)
    await ctx.db(Sequence).updateOne({ _id: id }, { $set: { archivedAt: new Date() } })
    const stopped = await ctx.db(SequenceEnrollment).updateMany({ sequenceId: id, status: 'active' }, { $set: { status: 'exited', exitReason: 'archived', finishedAt: new Date(), claimedUntil: null } })
    await audit(ctx, { action: 'orbit.sequence.archived', entity: 'Sequence', entityId: id, summary: `Archived sequence ${seq.name}`, product: 'orbit' })
    refresh(id)
    return ok(`Sequence archived${stopped.modifiedCount ? `; ${pluralize(stopped.modifiedCount, 'lead')} stopped` : ''}`, undefined, BASE)
  },
  O,
)

const isDuplicateKey = (error: unknown) => (error as { code?: number } | null)?.code === 11000

/** Enrols leads you can edit that are open, have an email (when the sequence sends one) and are not in another sequence. You become the sender. */
export const enrollLeads = action(
  z.object({ sequenceId: objectId, ids: listOf(objectId).refine((v) => v.length > 0 && v.length <= MAX_BULK, `Pick 1 to ${MAX_BULK} leads`) }),
  async ({ sequenceId, ids }, ctx) => {
    const seq = await ctx.db(Sequence).findOne({ _id: sequenceId, archivedAt: null }, { name: 1, steps: 1 }).lean()
    if (!seq) return fail('That sequence is archived or gone.')
    const needsEmail = seq.steps.some((s) => s.kind === 'email')
    const leads = await ctx.db(Lead).find({ _id: { $in: ids }, ...leadAccess(ctx) }, { stage: 1, email: 1, ownerId: 1, reviewerId: 1 }).lean()
    let enrolled = 0
    for (const lead of leads) {
      if (!isOpenLead(lead.stage) || !canEditLead(ctx, lead) || (needsEmail && !lead.email)) continue
      try {
        await ctx.db(SequenceEnrollment).create({ sequenceId, leadId: lead._id, senderId: ctx.memberId, status: 'active', stepIndex: 0, nextRunAt: new Date() })
        enrolled += 1
      } catch (error) {
        if (!isDuplicateKey(error)) throw error
      }
    }
    if (!enrolled) return fail('No leads were enrolled. They are closed, already in a sequence, have no email, or are not yours.')
    await audit(ctx, { action: 'orbit.sequence.enrolled', entity: 'Sequence', entityId: sequenceId, summary: `Enrolled ${pluralize(enrolled, 'lead')} in ${seq.name}`, product: 'orbit' })
    refresh(sequenceId, ids.length === 1 ? ids[0] : undefined)
    const skipped = ids.length - enrolled
    return ok(`${pluralize(enrolled, 'lead')} enrolled in '${seq.name}'${skipped ? `; ${skipped} skipped (closed, already in a sequence, no email or not yours)` : ''}. The first step runs within 15 minutes, inside the send window.`)
  },
  O,
)

export const unenrollLead = action(
  z.object({ leadId: objectId }),
  async ({ leadId }, ctx) => {
    const lead = await loadLead(ctx, leadId)
    if (!canEditLead(ctx, lead)) return fail("Only this lead's owner or reviewer can do that.")
    if (!(await exitLeadEnrollments(ctx, [lead._id], 'manual'))) return fail('This lead is not in a sequence.')
    refresh(undefined, leadId)
    return ok('Removed from the sequence. No more steps will run.')
  },
  O,
)

/** The lead replied: stop the sequence, log the reply and move a new or contacted lead to Engaged. */
export const markReplied = action(
  z.object({ leadId: objectId }),
  async ({ leadId }, ctx) => {
    const lead = await loadLead(ctx, leadId)
    if (!canEditLead(ctx, lead)) return fail("Only this lead's owner or reviewer can do that.")
    if (!(await exitLeadEnrollments(ctx, [lead._id], 'replied'))) return fail('This lead is not in a sequence.')
    const now = new Date()
    await ctx.db(Activity).create({ leadId: lead._id, clientId: lead.clientId ?? null, type: 'reply', status: 'done', channel: 'email', title: 'Replied to the sequence', occurredAt: now, assigneeId: ctx.memberId, createdBy: ctx.memberId })
    await ctx.db(Lead).updateOne({ _id: lead._id }, { $set: { lastActivityAt: now } })
    let moved = false
    if (lead.stage === 'new' || lead.stage === 'contacted') {
      moved = await applyLeadMove(ctx, lead, await getOrbitSettings(ctx), { to: 'engaged', via: 'move' }).then(
        () => true,
        (error: unknown) => (error instanceof UserError ? false : Promise.reject(error)),
      )
    }
    refresh(undefined, leadId)
    return ok(moved ? 'Marked as replied and moved to Engaged. The sequence stopped.' : 'Marked as replied. The sequence stopped.')
  },
  O,
)
