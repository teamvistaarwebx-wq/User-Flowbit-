import 'server-only'
import { isValidObjectId, type Types } from 'mongoose'
import type { Ctx } from '@/lib/ctx'
import { ForbiddenError, NotFoundError, UserError } from '@/lib/errors'
import { Client } from '@/models/Client'
import { Deal } from '@/models/orbit/Deal'
import { Lead } from '@/models/orbit/Lead'
import { OUTREACH_TYPES, type ActivityType, type LeadStage } from './constants'
import { canEditDeal, canEditLead, loadDeal, loadLead, type DealDoc, type LeadDoc } from './scope'

export type Related = {
  leadId: Types.ObjectId | null
  dealId: Types.ObjectId | null
  clientId: Types.ObjectId | null
  contactId: string | null
  ownerId: Types.ObjectId
  name: string
  lead?: LeadDoc
  deal?: DealDoc
}

/**
 * The record an activity belongs to (lead, deal or client) with edit rights
 * checked. Converted leads refuse new activity ("Log it on the deal").
 */
export async function resolveRelated(ctx: Ctx, ids: { leadId?: string; dealId?: string; clientId?: string; contactId?: string }): Promise<Related> {
  const rel = await resolveRecord(ctx, ids)
  await assertContactOnClient(ctx, rel)
  return rel
}

/** The contact must be one of the related client's contacts, so it never lands on another client's timeline (R3 L-21a). */
async function assertContactOnClient(ctx: Ctx, rel: Pick<Related, 'clientId' | 'contactId'>): Promise<void> {
  if (!rel.contactId) return
  if (!rel.clientId) throw new UserError('Pick a client before choosing a contact.')
  const found = isValidObjectId(rel.contactId) && (await ctx.db(Client).exists({ _id: rel.clientId, 'contacts._id': rel.contactId }))
  if (!found) throw new UserError('That contact is not on this client.')
}

async function resolveRecord(ctx: Ctx, ids: { leadId?: string; dealId?: string; clientId?: string; contactId?: string }): Promise<Related> {
  const contactId = ids.contactId ?? null
  if (ids.dealId) {
    const deal = await loadDeal(ctx, ids.dealId)
    if (!canEditDeal(ctx, deal)) throw new ForbiddenError('Only the deal owner or a reviewer can add activity to this deal.')
    return { leadId: null, dealId: deal._id, clientId: deal.clientId ?? null, contactId, ownerId: deal.ownerId, name: deal.title, deal }
  }
  if (ids.leadId) {
    const lead = await loadLead(ctx, ids.leadId)
    if (lead.stage === 'converted') throw new UserError('This lead is converted. Log it on the deal.')
    if (!canEditLead(ctx, lead)) throw new ForbiddenError("Only this lead's owner or reviewer can add activity to it.")
    return { leadId: lead._id, dealId: null, clientId: lead.clientId ?? null, contactId, ownerId: lead.ownerId, name: lead.companyName, lead }
  }
  if (ids.clientId) {
    ctx.assert('clients.read')
    if (!isValidObjectId(ids.clientId)) throw new NotFoundError('That client')
    const client = await ctx.db(Client).findById(ids.clientId, { name: 1 }).lean()
    if (!client) throw new NotFoundError('That client')
    return { leadId: null, dealId: null, clientId: client._id, contactId, ownerId: ctx.memberId, name: client.name }
  }
  throw new UserError('Pick a lead, deal or client for this activity.')
}

/** Touches lastActivityAt on the related lead/deal after a done activity. */
export async function touchRelated(ctx: Ctx, rel: Pick<Related, 'leadId' | 'dealId'>, at: Date): Promise<void> {
  if (rel.leadId) await ctx.db(Lead).updateOne({ _id: rel.leadId }, { $max: { lastActivityAt: at } })
  if (rel.dealId) await ctx.db(Deal).updateOne({ _id: rel.dealId }, { $max: { lastActivityAt: at } })
}

/** The next lead stage a just-logged activity makes reachable (for the "Move to …" toast action). */
export function unlockedStage(stage: LeadStage, type: ActivityType, sourceIsWarm: boolean): LeadStage | null {
  if (stage === 'new' && (OUTREACH_TYPES as readonly string[]).includes(type)) return 'contacted'
  if (type === 'reply' && (stage === 'contacted' || (stage === 'new' && sourceIsWarm))) return 'engaged'
  if (type === 'meeting' && stage === 'meeting_booked') return 'meeting_done'
  return null
}
