import 'server-only'
import type { Ctx } from '@/lib/ctx'
import { withTransaction } from '@/lib/db'
import { UserError } from '@/lib/errors'
import { Deal } from '@/models/orbit/Deal'
import { checkDealTransition, type DealTransitionInput } from './dealStage'
import { cancelPlannedOnClose, recordStage, refreshNextFollowUp, stageBeforeClose } from './next-step'
import { isMe, type DealDoc } from './scope'
import { activeKeys, type OrbitConfig } from './settings'

/** Deal stage moves shared by the deal actions and the MCP apply (one rule set, checked by checkDealTransition). */

type Via = DealTransitionInput['via']

export async function dealTransition(ctx: Ctx, deal: DealDoc, cfg: OrbitConfig, to: string, via: Via, extra: Partial<DealTransitionInput> = {}) {
  const reopenTo = via === 'reopen' ? await stageBeforeClose(ctx, 'deal', deal._id, ['won', 'lost']) : null
  const res = checkDealTransition({
    deal: { stage: deal.stage, status: deal.status as 'open' | 'won' | 'lost', closedAt: deal.closedAt },
    to, via, stages: cfg.dealStages, reopenTo, now: new Date(),
    can: { write: ctx.can('deals.write'), close: ctx.can('orbit.close'), isOwner: isMe(ctx, deal.ownerId) },
    activeLostReasons: activeKeys(cfg.lostReasons), activeWonReasons: activeKeys(cfg.wonReasons),
    ...extra,
  })
  if (!res.ok) throw new UserError(res.error)
  return res
}

export async function persistDealMove(ctx: Ctx, deal: DealDoc, res: Awaited<ReturnType<typeof dealTransition>>, set: Record<string, unknown> = {}) {
  await withTransaction(async (session) => {
    const updated = await ctx.db(Deal).findOneAndUpdate({ _id: deal._id, stage: deal.stage }, { $set: { ...res.patch, ...set } }, { session })
    if (!updated) throw new UserError('This deal changed while you were looking at it. Refresh and try again.')
    await recordStage(ctx, { entity: 'deal', entityId: deal._id, fromStage: deal.stage, toStage: res.to, reasonCode: res.patch.lostReason?.code, reasonNote: res.patch.lostReason?.note ?? res.patch.wonReason }, session)
    if (res.to === 'won' || res.to === 'lost') {
      await cancelPlannedOnClose(ctx, { dealId: deal._id }, `Deal ${res.to}`, new Date(), session)
      await refreshNextFollowUp(ctx, { dealId: deal._id, leadId: deal.leadId }, session)
    }
  })
}

