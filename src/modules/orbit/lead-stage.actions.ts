'use server'

import type { Types } from 'mongoose'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { action, fail, ok } from '@/lib/actions'
import { audit } from '@/lib/audit'
import { withTransaction } from '@/lib/db'
import { todayIST } from '@/lib/dates'
import { UserError } from '@/lib/errors'
import { notifyMembers } from '@/lib/notify'
import { objectId } from '@/lib/validation'
import { recordUsage } from '@/lib/usage'
import { Client } from '@/models/Client'
import { Activity } from '@/models/orbit/Activity'
import { Deal } from '@/models/orbit/Deal'
import { Lead } from '@/models/orbit/Lead'
import { LEAD_STAGE_LABEL } from './constants'
import { applyLeadMove } from './lead-move'
import { checkLeadTransition } from './leadStage'
import { refreshNextFollowUp, recordStage } from './next-step'
import { assertActiveMembers } from './people'
import { convertLeadSchema, moveLeadSchema } from './schemas'
import { canEditLead, isMe, loadLead } from './scope'
import { exitLeadEnrollments } from './sequences/store'
import { getOrbitSettings } from './settings'

const O = { product: 'orbit' } as const
const refresh = (id: string) => {
  revalidatePath('/app/orbit')
  revalidatePath('/app/orbit/leads')
  revalidatePath(`/app/orbit/leads/${id}`)
}

export const moveLeadStage = action(
  moveLeadSchema,
  async (input, ctx) => {
    const lead = await loadLead(ctx, input.id)
    if (lead.stage !== input.fromStage) return fail('This lead changed while you were looking at it. Refresh and try again.')
    if (input.toStage === 'lost') ctx.assert('orbit.close', 'Only a reviewer can mark a lead Lost.')
    if (input.toStage === 'meeting_booked' && input.meetingDate && input.meetingDate < todayIST()) return fail('Some fields need attention.', { meetingDate: 'Pick today or a later date' })
    const cfg = await getOrbitSettings(ctx)
    const to = await applyLeadMove(ctx, lead, cfg, {
      to: input.toStage,
      via: 'move',
      reasonCode: input.reasonCode,
      reasonNote: input.reasonNote,
      meeting: input.meetingDate ? { date: input.meetingDate, time: input.meetingTime, link: input.meetingLink } : undefined,
      meetingNotes: input.meetingNotes,
    })
    await audit(ctx, { action: 'orbit.lead.stage', entity: 'Lead', entityId: lead._id, summary: `${lead.companyName}: ${LEAD_STAGE_LABEL[lead.stage]} → ${LEAD_STAGE_LABEL[to]}`, product: 'orbit', meta: { from: lead.stage, to, reasonCode: input.reasonCode } })
    if (to === 'meeting_done' && lead.reviewerId && !isMe(ctx, lead.reviewerId)) {
      await notifyMembers(ctx, [lead.reviewerId], { title: `'${lead.companyName}' is ready to convert`, body: 'The meeting is done. Convert it to a client and a deal.', href: `/app/orbit/leads/${lead._id}`, kind: 'approval', product: 'orbit', event: 'orbit.lead_ready' })
    }
    refresh(input.id)
recordUsage({ kind: 'lead_touched', orgId: ctx.orgId, userId: ctx.userId, product: 'orbit', meta: { via: 'stage' } })
    return ok(`Lead '${lead.companyName}' moved to ${LEAD_STAGE_LABEL[to]}`)
  },
  { ...O, perm: 'leads.write' },
)

export const reopenLead = action(
  z.object({ id: objectId }),
  async ({ id }, ctx) => {
    const lead = await loadLead(ctx, id)
    const cfg = await getOrbitSettings(ctx)
    const to = await applyLeadMove(ctx, lead, cfg, { to: 'new', via: 'reopen' })
    await audit(ctx, { action: 'orbit.lead.reopen', entity: 'Lead', entityId: lead._id, summary: `Reopened ${lead.companyName} at ${LEAD_STAGE_LABEL[to]}`, product: 'orbit' })
    refresh(id)
    return ok(`Lead '${lead.companyName}' reopened at ${LEAD_STAGE_LABEL[to]}`)
  },
  { ...O, perm: 'orbit.close' },
)

export const convertLead = action(
  convertLeadSchema,
  async (input, ctx) => {
    const lead = await loadLead(ctx, input.id)
    if (!canEditLead(ctx, lead)) return fail("Only this lead's owner or reviewer can convert it.")
    const cfg = await getOrbitSettings(ctx)
    const stage = cfg.dealStages.find((s) => s.key === input.stage)
    if (!stage) return fail('Some fields need attention.', { stage: 'Pick a deal stage' })
    if (input.expectedCloseDate && input.expectedCloseDate < todayIST()) return fail('Some fields need attention.', { expectedCloseDate: 'Pick today or a later date' })
    if (input.clientMode === 'existing' && !input.clientId) return fail('Some fields need attention.', { clientId: 'Pick a client' })
    const ownerId = ctx.can('orbit.close') && input.ownerId ? input.ownerId : String(lead.ownerId)
    await assertActiveMembers(ctx, [ownerId])
    const now = new Date()
    const check = checkLeadTransition({
      lead: lead as Parameters<typeof checkLeadTransition>[0]['lead'], to: 'converted', via: 'convert', now,
      can: { write: ctx.can('leads.write'), close: ctx.can('orbit.close') },
      evidence: { hasOutreach: true, hasReply: true, hasMeetingHeld: true },
      sourceIsWarm: false, activeReasons: [],
    })
    if (!check.ok) return fail(check.error)

    const contact = lead.contactName || lead.email || lead.phone ? { name: lead.contactName || lead.companyName, email: lead.email || undefined, phone: lead.phone || undefined, role: lead.designation || undefined } : null
    const { dealId, linkedClient } = await withTransaction(async (session) => {
      const client = input.clientMode === 'existing' ? await ctx.db(Client).findById(input.clientId, null, { session }) : null
      if (input.clientMode === 'existing' && !client) throw new UserError('That client was not found. Pick another one.')
      let clientId = client?._id
      let contactId: Types.ObjectId | undefined = undefined
      if (client) {
        const match = contact ? client.contacts.find((c) => (contact.email ? c.email === contact.email : c.name.toLowerCase() === contact.name.toLowerCase())) : undefined
        if (contact && !match) {
          client.contacts.push({ ...contact, primary: client.contacts.length === 0 })
          await client.save({ session })
          contactId = client.contacts[client.contacts.length - 1]._id
        } else contactId = match?._id
      } else {
        const created = await ctx.db(Client).create(
          { name: lead.companyName, kind: 'company', email: lead.email || undefined, phone: lead.phone || undefined, website: lead.website || undefined, source: lead.source, sector: lead.sector, ownerId: lead.ownerId, status: 'lead', contacts: contact ? [{ ...contact, primary: true }] : [] },
          { session },
        )
        clientId = created._id
        contactId = created.contacts[0]?._id
      }
      const deal = await ctx.db(Deal).create(
        { title: input.title, clientId, leadId: lead._id, contactId, valuePaise: input.valueRupees, stage: stage.key, probability: stage.probability, ownerId, expectedCloseDate: input.expectedCloseDate, status: 'open', source: lead.source, sector: lead.sector, stageChangedAt: now, lastActivityAt: now, createdBy: ctx.memberId },
        { session },
      )
      await recordStage(ctx, { entity: 'deal', entityId: deal._id, fromStage: null, toStage: stage.key, at: now }, session)
      const updated = await ctx.db(Lead).findOneAndUpdate({ _id: lead._id, stage: 'meeting_done' }, { $set: { ...check.patch, clientId, dealId: deal._id } }, { session })
      if (!updated) throw new UserError('This lead changed while you were looking at it. Refresh and try again.')
      await recordStage(ctx, { entity: 'lead', entityId: lead._id, fromStage: 'meeting_done', toStage: 'converted', at: now }, session)
      await ctx.db(Activity).updateMany({ leadId: lead._id }, { $set: { clientId } }, { session })
      await ctx.db(Activity).updateMany({ leadId: lead._id, status: 'planned' }, { $set: { dealId: deal._id } }, { session })
      await refreshNextFollowUp(ctx, { leadId: lead._id, dealId: deal._id }, session)
      return { dealId: String(deal._id), linkedClient: client?.name ?? null }
    })

    await exitLeadEnrollments(ctx, [lead._id], 'won')
    const outcome = linkedClient ? `deal created for ${linkedClient}` : 'client and deal created'
    await audit(ctx, { action: 'orbit.lead.convert', entity: 'Lead', entityId: lead._id, summary: linkedClient ? `Converted ${lead.companyName} into a deal for ${linkedClient}` : `Converted ${lead.companyName} into a client and a deal`, product: 'orbit', meta: { dealId } })
    refresh(input.id)
    revalidatePath('/app/orbit/deals')
    revalidatePath('/app/clients')
    return ok(`'${lead.companyName}' converted: ${outcome}`, { id: dealId }, `/app/orbit/deals/${dealId}`)
  },
  { ...O, perm: 'leads.write' },
)
