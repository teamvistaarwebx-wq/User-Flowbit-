'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { action, fail, ok } from '@/lib/actions'
import { audit } from '@/lib/audit'
import type { Ctx } from '@/lib/ctx'
import { withTransaction } from '@/lib/db'
import { todayIST } from '@/lib/dates'
import { UserError } from '@/lib/errors'
import { formatINR } from '@/lib/money'
import { notifyMembers } from '@/lib/notify'
import { emitDealWon } from './automation-events'
import { objectId, requiredText } from '@/lib/validation'
import { Client } from '@/models/Client'
import { Activity } from '@/models/orbit/Activity'
import { Deal } from '@/models/orbit/Deal'
import { StageEvent } from '@/models/orbit/StageEvent'
import { dealStageLabel } from './dealStage'
import { recordStage } from './next-step'
import { assertActiveMembers } from './people'
import { dealFieldsSchema, optDate, reasonSchema, requiredPaise } from './schemas'
import { canEditDeal, isMe, loadDeal } from './scope'
import { getOrbitSettings } from './settings'
import { folioLinksForDeal } from './folio-links'
import { dealTransition, persistDealMove } from './deal-moves'

const O = { product: 'orbit' } as const
const refresh = (id?: string, clientId?: unknown) => {
  revalidatePath('/app/orbit')
  revalidatePath('/app/orbit/deals')
  if (id) revalidatePath(`/app/orbit/deals/${id}`)
  if (clientId) revalidatePath(`/app/clients/${clientId}`)
}

async function assertContact(ctx: Ctx, clientId: string | undefined, contactId: string | undefined) {
  if (!contactId) return
  if (!clientId) throw new UserError('Pick a client before choosing a contact.')
  const found = await ctx.db(Client).exists({ _id: clientId, 'contacts._id': contactId })
  if (!found) throw new UserError('That contact is not on this client.')
}

const createSchema = dealFieldsSchema.extend({ clientId: z.preprocess((v) => (v === '' ? undefined : v), objectId.optional()), stage: requiredText('Stage', 40) })

export const createDeal = action(
  createSchema,
  async (input, ctx) => {
    if (!input.clientId) return fail('Some fields need attention.', { clientId: 'Pick a client or create one' })
    const cfg = await getOrbitSettings(ctx)
    const stage = cfg.dealStages.find((s) => s.key === input.stage)
    if (!stage) return fail('Some fields need attention.', { stage: 'Pick a stage' })
    if (input.expectedCloseDate && input.expectedCloseDate < todayIST()) return fail('Some fields need attention.', { expectedCloseDate: 'Pick today or a later date' })
    const client = await ctx.db(Client).findById(input.clientId, { name: 1 }).lean()
    if (!client) return fail('Some fields need attention.', { clientId: 'Pick a client or create one' })
    await assertContact(ctx, input.clientId, input.contactId)
    const ownerId = ctx.can('orbit.close') && input.ownerId ? input.ownerId : String(ctx.memberId)
    await assertActiveMembers(ctx, [ownerId])
    const now = new Date()
    const deal = await withTransaction(async (session) => {
      const created = await ctx.db(Deal).create(
        {
          title: input.title, clientId: input.clientId, contactId: input.contactId, valuePaise: input.valueRupees, stage: stage.key, probability: input.probability ?? stage.probability,
          ownerId, expectedCloseDate: input.expectedCloseDate, status: 'open', source: input.source, sector: input.sector, notes: input.notes ?? '', stageChangedAt: now, lastActivityAt: now, createdBy: ctx.memberId,
        },
        { session },
      )
      await recordStage(ctx, { entity: 'deal', entityId: created._id, fromStage: null, toStage: stage.key, at: now }, session)
      return created
    })
    await audit(ctx, { action: 'orbit.deal.create', entity: 'Deal', entityId: deal._id, summary: `Added deal ${deal.title} for ${client.name} (${formatINR(deal.valuePaise)})`, product: 'orbit' })
    if (!isMe(ctx, ownerId)) await notifyMembers(ctx, [ownerId], { title: `Deal '${deal.title}' assigned to you`, href: `/app/orbit/deals/${deal._id}`, kind: 'assignment', product: 'orbit', event: 'orbit.deal_assigned' })
    refresh(undefined, input.clientId)
    return ok(`Deal '${deal.title}' added`, { id: String(deal._id) }, `/app/orbit/deals/${deal._id}`)
  },
  { ...O, perm: 'deals.write' },
)

export const updateDeal = action(
  dealFieldsSchema.extend({ id: objectId }),
  async (input, ctx) => {
    const deal = await loadDeal(ctx, input.id)
    if (!canEditDeal(ctx, deal)) return fail('Only the deal owner or a reviewer can edit this deal.')
    await assertContact(ctx, deal.clientId ? String(deal.clientId) : undefined, input.contactId)
    const ownerId = ctx.can('orbit.close') && input.ownerId ? input.ownerId : String(deal.ownerId)
    if (ownerId !== String(deal.ownerId)) await assertActiveMembers(ctx, [ownerId])
    const next = {
      title: input.title, valuePaise: input.valueRupees, probability: deal.status === 'open' ? (input.probability ?? deal.probability) : deal.probability,
      expectedCloseDate: input.expectedCloseDate, contactId: input.contactId, source: input.source, sector: input.sector, notes: input.notes ?? '', ownerId,
    }
    await ctx.db(Deal).updateOne({ _id: deal._id }, { $set: next })
    await audit(ctx, { action: 'orbit.deal.update', entity: 'Deal', entityId: deal._id, summary: `Edited deal ${input.title}`, product: 'orbit', changes: { before: deal, after: { ...deal, ...next } } })
    if (ownerId !== String(deal.ownerId) && !isMe(ctx, ownerId)) await notifyMembers(ctx, [ownerId], { title: `Deal '${input.title}' assigned to you`, href: `/app/orbit/deals/${deal._id}`, kind: 'assignment', product: 'orbit', event: 'orbit.deal_assigned' })
    refresh(input.id, deal.clientId)
    return ok(`Deal '${input.title}' saved`)
  },
  { ...O, perm: 'deals.write' },
)

export const moveDealStage = action(
  z.object({ id: objectId, fromStage: requiredText('Stage', 40), toStage: requiredText('Stage', 40) }),
  async (input, ctx) => {
    const deal = await loadDeal(ctx, input.id)
    if (deal.stage !== input.fromStage) return fail('This deal changed while you were looking at it. Refresh and try again.')
    if (input.toStage === 'won' || input.toStage === 'lost') return fail('Use Mark won or Mark lost to close a deal.')
    const cfg = await getOrbitSettings(ctx)
    const res = await dealTransition(ctx, deal, cfg, input.toStage, 'move')
    await persistDealMove(ctx, deal, res)
    await audit(ctx, { action: 'orbit.deal.stage', entity: 'Deal', entityId: deal._id, summary: `${deal.title}: ${dealStageLabel(cfg.dealStages, deal.stage)} → ${dealStageLabel(cfg.dealStages, res.to)}`, product: 'orbit' })
    refresh(input.id, deal.clientId)
    return ok(`Deal '${deal.title}' moved to ${dealStageLabel(cfg.dealStages, res.to)}`)
  },
  { ...O, perm: 'deals.write' },
)

export const winDeal = action(
  z.object({ id: objectId, valueRupees: requiredPaise('Enter the final value'), wonReason: z.preprocess((v) => (v === '' ? undefined : v), z.string().max(40).optional()), closeDate: optDate }),
  async (input, ctx) => {
    const deal = await loadDeal(ctx, input.id)
    if (input.closeDate && input.closeDate > todayIST()) return fail('Some fields need attention.', { closeDate: "Pick today or an earlier date" })
    const cfg = await getOrbitSettings(ctx)
    const res = await dealTransition(ctx, deal, cfg, 'won', 'win', { wonReason: input.wonReason })
    const closedAt = input.closeDate && input.closeDate !== todayIST() ? new Date(`${input.closeDate}T12:00:00+05:30`) : res.patch.closedAt
    await persistDealMove(ctx, deal, res, { valuePaise: input.valueRupees, closedAt })
    if (deal.clientId) await ctx.db(Client).updateOne({ _id: deal.clientId, status: 'lead' }, { $set: { status: 'active' } })
    const money = formatINR(input.valueRupees, { decimals: 0 })
    await audit(ctx, { action: 'orbit.deal.won', entity: 'Deal', entityId: deal._id, summary: `Won deal ${deal.title}: ${money}`, product: 'orbit', meta: { valuePaise: input.valueRupees, wonReason: input.wonReason } })
    if (!isMe(ctx, deal.ownerId)) await notifyMembers(ctx, [deal.ownerId], { title: `Deal '${deal.title}' won: ${money}`, href: `/app/orbit/deals/${deal._id}`, kind: 'success', product: 'orbit', event: 'orbit.deal_won' })
    await emitDealWon(ctx, { id: String(deal._id), title: deal.title, valuePaise: input.valueRupees, ownerId: deal.ownerId, stage: deal.stage })
    refresh(input.id, deal.clientId)
    return ok(`Deal '${deal.title}' won: ${money}`)
  },
  { ...O, perm: 'orbit.close' },
)

export const loseDeal = action(
  reasonSchema,
  async (input, ctx) => {
    const deal = await loadDeal(ctx, input.id)
    const cfg = await getOrbitSettings(ctx)
    const res = await dealTransition(ctx, deal, cfg, 'lost', 'lose', { reasonCode: input.reasonCode, reasonNote: input.reasonNote })
    await persistDealMove(ctx, deal, res)
    await audit(ctx, { action: 'orbit.deal.lost', entity: 'Deal', entityId: deal._id, summary: `Lost deal ${deal.title}`, product: 'orbit', meta: { reasonCode: input.reasonCode, reasonNote: input.reasonNote } })
    if (!isMe(ctx, deal.ownerId)) await notifyMembers(ctx, [deal.ownerId], { title: `Deal '${deal.title}' marked lost`, href: `/app/orbit/deals/${deal._id}`, kind: 'warning', product: 'orbit', event: 'orbit.deal_lost' })
    refresh(input.id, deal.clientId)
    return ok(`Deal '${deal.title}' marked lost`)
  },
  { ...O, perm: 'orbit.close' },
)

export const reopenDeal = action(
  z.object({ id: objectId }),
  async ({ id }, ctx) => {
    const deal = await loadDeal(ctx, id)
    const cfg = await getOrbitSettings(ctx)
    const res = await dealTransition(ctx, deal, cfg, '', 'reopen')
    await persistDealMove(ctx, deal, res)
    await audit(ctx, { action: 'orbit.deal.reopen', entity: 'Deal', entityId: deal._id, summary: `Reopened deal ${deal.title} at ${dealStageLabel(cfg.dealStages, res.to)}`, product: 'orbit' })
    refresh(id, deal.clientId)
    return ok(`Deal '${deal.title}' reopened at ${dealStageLabel(cfg.dealStages, res.to)}`)
  },
  { ...O, perm: 'orbit.close' },
)

export const deleteDeal = action(
  z.object({ id: objectId }),
  async ({ id }, ctx) => {
    const deal = await loadDeal(ctx, id)
    if (deal.leadId) return fail('This deal came from a converted lead. Mark it lost instead.')
    const folio = await folioLinksForDeal(ctx, deal._id, { strict: true })
    if (folio.length) return fail(`${folio[0].label} exists for this deal. Void it in Folio, then mark the deal lost.`)
    await withTransaction(async (session) => {
      await ctx.db(Activity).deleteMany({ dealId: deal._id }, { session })
      await ctx.db(StageEvent).deleteMany({ entity: 'deal', entityId: deal._id }, { session })
      await ctx.db(Deal).deleteOne({ _id: deal._id }, { session })
    })
    await audit(ctx, { action: 'orbit.deal.delete', entity: 'Deal', entityId: deal._id, summary: `Deleted deal ${deal.title}`, product: 'orbit', changes: { before: deal } })
    refresh(undefined, deal.clientId)
    return ok(`Deal '${deal.title}' deleted`, undefined, '/app/orbit/deals')
  },
  { ...O, perm: 'orbit.settings' },
)
