import 'server-only'
import type { ClientSession, Types } from 'mongoose'
import type { Ctx } from '@/lib/ctx'
import { Activity } from '@/models/orbit/Activity'
import { Deal } from '@/models/orbit/Deal'
import { Lead } from '@/models/orbit/Lead'
import { StageEvent } from '@/models/orbit/StageEvent'
import { pickNext } from './followUps'

type Id = Types.ObjectId | string

/** Recomputes the denormalised `nextFollowUp` on a lead and/or deal. */
export async function refreshNextFollowUp(ctx: Pick<Ctx, 'db'>, ids: { leadId?: Id | null; dealId?: Id | null }, session?: ClientSession): Promise<void> {
  const opts = session ? { session } : {}
  if (ids.leadId) {
    const planned = await ctx.db(Activity).find({ leadId: ids.leadId, status: 'planned' }, null, opts).lean()
    await ctx.db(Lead).updateOne({ _id: ids.leadId }, { $set: { nextFollowUp: pickNext(planned) } }, opts)
  }
  if (ids.dealId) {
    const planned = await ctx.db(Activity).find({ dealId: ids.dealId, status: 'planned' }, null, opts).lean()
    await ctx.db(Deal).updateOne({ _id: ids.dealId }, { $set: { nextFollowUp: pickNext(planned) } }, opts)
  }
}

/**
 * Cancels the planned follow-ups of a lead or deal that just closed (lost,
 * disqualified, won), so they leave Due today, Overdue and reminders.
 */
export async function cancelPlannedOnClose(ctx: Ctx, on: { leadId: Id } | { dealId: Id }, reason: string, at: Date, session?: ClientSession): Promise<void> {
  await ctx.db(Activity).updateMany({ ...on, status: 'planned' }, { $set: { status: 'cancelled', cancelledAt: at, cancelReason: reason } }, session ? { session } : {})
}

/** Appends a stage event (the only writer of StageEvent). */
export async function recordStage(
  ctx: Ctx,
  event: { entity: 'lead' | 'deal'; entityId: Id; fromStage: string | null; toStage: string; reasonCode?: string | null; reasonNote?: string | null; at?: Date },
  session?: ClientSession,
): Promise<void> {
  await ctx.db(StageEvent).create(
    { entity: event.entity, entityId: event.entityId, fromStage: event.fromStage, toStage: event.toStage, reasonCode: event.reasonCode ?? null, reasonNote: event.reasonNote ?? null, changedBy: ctx.memberId, changedAt: event.at ?? new Date() },
    session ? { session } : undefined,
  )
}

/** Stage a closed lead or deal had before it closed. */
export async function stageBeforeClose(ctx: Ctx, entity: 'lead' | 'deal', entityId: Id, closedStages: string[]): Promise<string | null> {
  const last = await ctx.db(StageEvent).findOne({ entity, entityId, toStage: { $in: closedStages } }).sort({ changedAt: -1 }).lean()
  return last?.fromStage ?? null
}
