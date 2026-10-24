import 'server-only'
import { isValidObjectId, Types } from 'mongoose'
import type { Ctx } from '@/lib/ctx'
import { NotFoundError } from '@/lib/errors'
import { Deal } from '@/models/orbit/Deal'
import { Lead } from '@/models/orbit/Lead'

export type Filter = Record<string, unknown>
type Owned = { ownerId?: unknown; reviewerId?: unknown }

export const isMe = (ctx: Ctx, id: unknown) => id != null && String(id) === String(ctx.memberId)
export const viewAll = (ctx: Ctx) => ctx.can('orbit.view_all')

/** Leads you may read: everyone's with view_all, else those you own or review. */
export const leadAccess = (ctx: Ctx): Filter => (viewAll(ctx) ? {} : { $or: [{ ownerId: ctx.memberId }, { reviewerId: ctx.memberId }] })
/** Deals you may read: everyone's with view_all, else those you own. */
export const dealAccess = (ctx: Ctx): Filter => (viewAll(ctx) ? {} : { ownerId: ctx.memberId })

export type OwnerScope = { key: string; memberId: Types.ObjectId | null }

/** `?owner=me|all|<memberId>`; without view_all it is always you. Default: whole team for view_all. */
export function resolveOwner(ctx: Ctx, raw: string | undefined): OwnerScope {
  if (!viewAll(ctx) || raw === 'me') return { key: 'me', memberId: ctx.memberId }
  if (raw && isValidObjectId(raw)) return { key: raw, memberId: new Types.ObjectId(raw) }
  return { key: 'all', memberId: null }
}

export function leadOwnerFilter(ctx: Ctx, owner: OwnerScope): Filter {
  if (!owner.memberId) return leadAccess(ctx)
  return isMe(ctx, owner.memberId) ? { $or: [{ ownerId: owner.memberId }, { reviewerId: owner.memberId }] } : { ownerId: owner.memberId }
}

export const dealOwnerFilter = (ctx: Ctx, owner: OwnerScope): Filter => (owner.memberId ? { ownerId: owner.memberId } : dealAccess(ctx))

/** Activities owned by a person (assigned to or logged by), or everything you can see. */
export async function activityOwnerFilter(ctx: Ctx, owner: OwnerScope): Promise<Filter> {
  if (owner.memberId && (viewAll(ctx) || !isMe(ctx, owner.memberId))) return { $or: [{ assigneeId: owner.memberId }, { createdBy: owner.memberId }] }
  if (viewAll(ctx)) return {}
  const [leadIds, dealIds] = await Promise.all([ctx.db(Lead).distinct('_id', leadAccess(ctx)), ctx.db(Deal).distinct('_id', dealAccess(ctx))])
  return { $or: [{ assigneeId: ctx.memberId }, { createdBy: ctx.memberId }, { leadId: { $in: leadIds } }, { dealId: { $in: dealIds } }] }
}

/** Activities you may read: everyone's with view_all, else yours and those on leads/deals you can see. */
export const activityAccess = (ctx: Ctx): Promise<Filter> => activityOwnerFilter(ctx, { key: 'all', memberId: null })

export const canEditLead = (ctx: Ctx, lead: Owned) => ctx.can('orbit.close') || (ctx.can('leads.write') && (isMe(ctx, lead.ownerId) || isMe(ctx, lead.reviewerId)))
export const canEditDeal = (ctx: Ctx, deal: Owned) => ctx.can('orbit.close') || (ctx.can('deals.write') && isMe(ctx, deal.ownerId))

/** A lead in your scope, or NotFoundError (never reveal records outside it). */
export async function loadLead(ctx: Ctx, id: string) {
  if (!isValidObjectId(id)) throw new NotFoundError('That lead')
  const lead = await ctx.db(Lead).findOne({ _id: id, ...leadAccess(ctx) }).lean()
  if (!lead) throw new NotFoundError('That lead')
  return lead
}

export async function loadDeal(ctx: Ctx, id: string) {
  if (!isValidObjectId(id)) throw new NotFoundError('That deal')
  const deal = await ctx.db(Deal).findOne({ _id: id, ...dealAccess(ctx) }).lean()
  if (!deal) throw new NotFoundError('That deal')
  return deal
}

export type LeadDoc = Awaited<ReturnType<typeof loadLead>>
export type DealDoc = Awaited<ReturnType<typeof loadDeal>>
