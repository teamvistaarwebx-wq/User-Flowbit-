import 'server-only'
import type { Types } from 'mongoose'
import { audit } from '@/lib/audit'
import type { Ctx } from '@/lib/ctx'
import { withTransaction } from '@/lib/db'
import { todayIST } from '@/lib/dates'
import { ForbiddenError, UserError } from '@/lib/errors'
import { formatINR } from '@/lib/money'
import { notifyMembers } from '@/lib/notify'
import { Client } from '@/models/Client'
import { Activity } from '@/models/orbit/Activity'
import { Lead } from '@/models/orbit/Lead'
import { StageEvent } from '@/models/orbit/StageEvent'
import { emitDealWon } from '@/modules/orbit/automation-events'
import { dealStageLabel } from '@/modules/orbit/dealStage'
import { dealTransition, persistDealMove } from '@/modules/orbit/deal-moves'
import { recordStage, refreshNextFollowUp } from '@/modules/orbit/next-step'
import { assertActiveMembers } from '@/modules/orbit/people'
import { resolveRelated, touchRelated } from '@/modules/orbit/related'
import type { ActivityType } from '@/modules/orbit/constants'
import { canEditDeal, canEditLead, isMe, loadDeal, loadLead } from '@/modules/orbit/scope'
import { activeKeys, getOrbitSettings } from '@/modules/orbit/settings'
import { fireWebhookEvent } from '@/modules/webhooks/emit'
import { recordLink } from '../data/candidates'
import type { ExecResult } from './types'

/** Orbit changes through MCP, on the same rules as the Orbit screens (scope, stage checks, follow-up refresh). */

type Doc = Record<string, unknown>

export type LeadPayload = Readonly<{ leadId?: string; companyName: string; contactName?: string; email?: string; phone?: string; notes?: string; valuePaise?: number; source?: string; sector?: string }>

async function createLead(ctx: Ctx, p: LeadPayload, via: string): Promise<ExecResult> {
  const cfg = await getOrbitSettings(ctx)
  const source = p.source && activeKeys(cfg.sources).includes(p.source) ? p.source : (activeKeys(cfg.sources).find((k) => k === 'other') ?? activeKeys(cfg.sources)[0])
  const sector = p.sector && activeKeys(cfg.sectors).includes(p.sector) ? p.sector : (activeKeys(cfg.sectors).find((k) => k === 'other') ?? activeKeys(cfg.sectors)[0])
  if (!source || !sector) throw new UserError('Orbit has no active lead source or sector. Add one in Orbit settings.')
  const ownerId = String(ctx.memberId)
  const reviewerId = cfg.defaultReviewerId
  await assertActiveMembers(ctx, [ownerId, reviewerId])
  const now = new Date()
  const lead = await withTransaction(async (session) => {
    const created = await ctx.db(Lead).create(
      { companyName: p.companyName, contactName: p.contactName ?? '', email: p.email ?? '', phone: p.phone ?? '', notes: p.notes ?? '', valuePaise: p.valuePaise ?? null, source, sector, stage: 'new', ownerId, reviewerId, stageChangedAt: now, lastActivityAt: now, createdBy: ctx.memberId },
      { session },
    )
    await recordStage(ctx, { entity: 'lead', entityId: created._id, fromStage: null, toStage: 'new', at: now }, session)
    return created
  })
  const events = await ctx.db(StageEvent).find({ entityId: lead._id }, { _id: 1 }).lean()
  await audit(ctx, { action: 'orbit.lead.create', entity: 'Lead', entityId: lead._id, summary: `Added lead ${lead.companyName}`, product: 'orbit', meta: { via } })
  fireWebhookEvent(ctx.orgId, 'lead.created', { id: String(lead._id), company: lead.companyName, contact: lead.contactName || null, email: lead.email || null, phone: lead.phone || null, source: lead.source, path: `/app/orbit/leads/${lead._id}` })
  if (reviewerId && !isMe(ctx, reviewerId)) await notifyMembers(ctx, [reviewerId], { title: `New lead '${lead.companyName}'`, body: `Added by ${via}.`, href: `/app/orbit/leads/${lead._id}`, kind: 'assignment', product: 'orbit', event: 'orbit.lead_assigned' })
  return { model: 'Lead', id: String(lead._id), label: lead.companyName, link: recordLink('lead', String(lead._id)), action: 'created', created: [{ model: 'Lead', ids: [lead._id] }, { model: 'StageEvent', ids: events.map((e) => e._id) }], restore: [] }
}

async function updateLead(ctx: Ctx, p: LeadPayload & { leadId: string }, via: string): Promise<ExecResult> {
  const lead = await loadLead(ctx, p.leadId)
  if (!canEditLead(ctx, lead)) throw new ForbiddenError("Only this lead's owner or reviewer can edit it.")
  const set: Doc = {}
  if (p.contactName) set.contactName = p.contactName
  if (p.phone && !lead.phone) set.phone = p.phone
  if (p.email && !lead.email) set.email = p.email.toLowerCase()
  if (p.valuePaise != null) set.valuePaise = p.valuePaise
  if (p.notes) set.notes = lead.notes ? `${lead.notes}\n\n${p.notes}` : p.notes
  if (Object.keys(set).length) await ctx.db(Lead).updateOne({ _id: lead._id }, { $set: set })
  await audit(ctx, { action: 'orbit.lead.update', entity: 'Lead', entityId: lead._id, summary: `Edited lead ${lead.companyName}`, product: 'orbit', meta: { via }, changes: { before: lead, after: { ...lead, ...set } } })
  return { model: 'Lead', id: String(lead._id), label: lead.companyName, link: recordLink('lead', String(lead._id)), action: 'updated', created: [], restore: [{ model: 'Lead', docs: [lead as unknown as Doc] }] }
}

/** Create, or update the lead matched on email or phone (never a duplicate). */
export async function upsertLeadMcp(ctx: Ctx, p: LeadPayload, via: string): Promise<ExecResult> {
  ctx.assertWritable()
  ctx.assert('leads.write')
  return p.leadId ? updateLead(ctx, { ...p, leadId: p.leadId }, via) : createLead(ctx, p, via)
}

export type ActivityPayload = Readonly<{ leadId: string; type: string; notes: string }>

export async function logActivityMcp(ctx: Ctx, p: ActivityPayload, via: string): Promise<ExecResult> {
  ctx.assertWritable()
  ctx.assert('activities.write')
  const rel = await resolveRelated(ctx, { leadId: p.leadId })
  const before = rel.lead
  const now = new Date()
  const type = (p.type === 'whatsapp' ? 'dm' : p.type) as ActivityType
  const activity = await ctx.db(Activity).create({ leadId: rel.leadId, clientId: rel.clientId, type, status: 'done', channel: type === 'dm' ? 'whatsapp' : type === 'call' ? 'phone' : type === 'email' ? 'email' : 'other', notes: p.notes, occurredAt: now, assigneeId: ctx.memberId, createdBy: ctx.memberId })
  await touchRelated(ctx, rel, now)
  await refreshNextFollowUp(ctx, rel)
  await audit(ctx, { action: 'orbit.activity.logged', entity: 'Lead', entityId: rel.leadId, summary: `Logged ${type} on ${rel.name}`, product: 'orbit', meta: { via, activityId: String(activity._id) } })
  return { model: 'Activity', id: String(activity._id), label: `${type} on ${rel.name}`, link: recordLink('lead', String(rel.leadId)), action: 'created', created: [{ model: 'Activity', ids: [activity._id] }], restore: before ? [{ model: 'Lead', docs: [before as unknown as Doc] }] : [] }
}

export type FollowupPayload = Readonly<{ leadId: string; dueDate: string; dueTime?: string | null; title?: string; type?: string; ownerId?: string }>

export async function scheduleFollowupMcp(ctx: Ctx, p: FollowupPayload, via: string): Promise<ExecResult> {
  ctx.assertWritable()
  ctx.assert('activities.write')
  if (p.dueDate < todayIST()) throw new UserError('Pick today or a later date for the follow-up.')
  const rel = await resolveRelated(ctx, { leadId: p.leadId })
  const assigneeId = p.ownerId ?? String(rel.ownerId)
  const allowed = ctx.can('orbit.close') || isMe(ctx, assigneeId) || String(rel.ownerId) === assigneeId
  if (!allowed) throw new ForbiddenError('Only a reviewer can assign follow-ups to someone else.')
  await assertActiveMembers(ctx, [assigneeId])
  const activity = await ctx.db(Activity).create({ leadId: rel.leadId, clientId: rel.clientId, type: (p.type ?? 'follow_up') as ActivityType, status: 'planned', title: p.title ?? 'Follow up', dueDate: p.dueDate, dueTime: p.dueTime ?? null, notes: '', assigneeId, createdBy: ctx.memberId })
  await refreshNextFollowUp(ctx, rel)
  if (!isMe(ctx, assigneeId)) await notifyMembers(ctx, [assigneeId], { title: `Follow-up for ${rel.name} due ${p.dueDate}`, href: '/app/orbit/activities', kind: 'assignment', product: 'orbit', event: 'orbit.followup_assigned' })
  await audit(ctx, { action: 'orbit.followup.scheduled', entity: 'Lead', entityId: rel.leadId, summary: `Scheduled a follow-up with ${rel.name} on ${p.dueDate}`, product: 'orbit', meta: { via, activityId: String(activity._id) } })
  return { model: 'Activity', id: String(activity._id), label: `Follow-up with ${rel.name} on ${p.dueDate}`, link: recordLink('lead', String(rel.leadId)), action: 'created', created: [{ model: 'Activity', ids: [activity._id] }], restore: rel.lead ? [{ model: 'Lead', docs: [rel.lead as unknown as Doc] }] : [] }
}

export type DealMovePayload = Readonly<{ dealId: string; to: string; reasonCode?: string; reasonNote?: string; valuePaise?: number }>

export async function moveDealMcp(ctx: Ctx, p: DealMovePayload, via: string): Promise<ExecResult> {
  ctx.assertWritable()
  const deal = await loadDeal(ctx, p.dealId)
  if (!canEditDeal(ctx, deal)) throw new ForbiddenError('Only the deal owner or a reviewer can move this deal.')
  const cfg = await getOrbitSettings(ctx)
  const startedAt = new Date()
  const set: Doc = {}
  let summary: string
  if (p.to === 'won') {
    const res = await dealTransition(ctx, deal, cfg, 'won', 'win', { wonReason: p.reasonCode })
    if (p.valuePaise != null) set.valuePaise = p.valuePaise
    await persistDealMove(ctx, deal, res, set)
    if (deal.clientId) await ctx.db(Client).updateOne({ _id: deal.clientId, status: 'lead' }, { $set: { status: 'active' } })
    const value = (set.valuePaise as number | undefined) ?? deal.valuePaise
    await emitDealWon(ctx, { id: String(deal._id), title: deal.title, valuePaise: value, ownerId: deal.ownerId, stage: deal.stage })
    summary = `Won deal ${deal.title}: ${formatINR(value, { decimals: 0 })}`
  } else if (p.to === 'lost') {
    const res = await dealTransition(ctx, deal, cfg, 'lost', 'lose', { reasonCode: p.reasonCode ?? 'other', reasonNote: p.reasonNote })
    await persistDealMove(ctx, deal, res)
    summary = `Lost deal ${deal.title}`
  } else {
    const res = await dealTransition(ctx, deal, cfg, p.to, 'move')
    await persistDealMove(ctx, deal, res)
    summary = `${deal.title}: ${dealStageLabel(cfg.dealStages, deal.stage)} → ${dealStageLabel(cfg.dealStages, res.to)}`
  }
  const events = await ctx.db(StageEvent).find({ entityId: deal._id, createdAt: { $gte: startedAt } }, { _id: 1 }).lean()
  await audit(ctx, { action: p.to === 'won' ? 'orbit.deal.won' : p.to === 'lost' ? 'orbit.deal.lost' : 'orbit.deal.stage', entity: 'Deal', entityId: deal._id, summary, product: 'orbit', meta: { via, reasonCode: p.reasonCode, reasonNote: p.reasonNote } })
  const ids: Types.ObjectId[] = events.map((e) => e._id)
  return { model: 'Deal', id: String(deal._id), label: deal.title, link: recordLink('deal', String(deal._id)), action: 'updated', created: ids.length ? [{ model: 'StageEvent', ids }] : [], restore: [{ model: 'Deal', docs: [deal as unknown as Doc] }] }
}
