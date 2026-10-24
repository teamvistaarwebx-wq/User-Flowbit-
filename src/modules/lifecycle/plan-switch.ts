import 'server-only'
import type { Types } from 'mongoose'
import { billableSeats } from '@/lib/billing'
import { freeReturnFields, freeReturnRefusal, trialStartFields, trialStartRefusal, type FreeReturnRefusal, type TrialRefusal } from '@/lib/lifecycle'
import { DEFAULT_PLAN_CONFIG, type PlanConfig } from '@/lib/plan-config'
import type { OrgLike } from '@/lib/plans'
import { freeDuplicateFilter, trialUsedFilter } from '@/lib/signup-guard'
import { Org } from '@/models/Org'
import { usageOf, type OrgDb } from '@/modules/subscription/usage'

/**
 * Free ↔ Trial switches (console spec 2, 4.2), shared by the subscription
 * page actions and the lifecycle cron. Each update is guarded in the filter,
 * so two clicks (or a click and the cron) can never start two trials.
 */

/** `{ a: 1 }` → `{ 'subscription.a': 1 }` for a $set on the embedded subscription. */
const subscriptionSet = (fields: Record<string, unknown>) => Object.fromEntries(Object.entries(fields).map(([key, value]) => [`subscription.${key}`, value]))

export type SwitchResult<R> = { ok: true; endsAt: Date } | { ok: false; reason: R }

/** Starts the workspace's one 15-day trial from Free. */
export async function startTrial(orgId: Types.ObjectId, org: OrgLike, now: Date = new Date(), config: Pick<PlanConfig, 'trialDays'> = DEFAULT_PLAN_CONFIG): Promise<SwitchResult<TrialRefusal>> {
  const refusal = trialStartRefusal(org, now)
  if (refusal) return { ok: false, reason: refusal }
  if (await trialTakenElsewhere(orgId)) return { ok: false, reason: 'business_used' }
  const fields = trialStartFields(org, now, config.trialDays)
  const res = await Org.updateOne({ _id: orgId, 'subscription.accountType': 'free', 'subscription.trialStartedAt': null }, { $set: subscriptionSet(fields) })
  return res.modifiedCount ? { ok: true, endsAt: fields.trialEndsAt } : { ok: false, reason: 'used' }
}

/** Another workspace of the same signup user, GSTIN or PAN already used the business's one trial (D5). */
async function trialTakenElsewhere(orgId: Types.ObjectId): Promise<boolean> {
  const self = await Org.findById(orgId, { createdBy: 1, gstin: 1, pan: 1 }).lean()
  if (!self?.createdBy) return false
  return Boolean(await Org.exists(trialUsedFilter({ userId: self.createdBy, gstin: self.gstin ?? undefined, pan: self.pan ?? undefined, excludeOrgId: orgId })))
}

/**
 * Another workspace of the same signup user, GSTIN or PAN is already on Free,
 * so this one may not drop back to Free: one Free workspace per business
 * (V2-REVIEW E1; signup alone was checked, a trial trimmed back was not).
 */
async function freeTakenElsewhere(orgId: Types.ObjectId): Promise<boolean> {
  const self = await Org.findById(orgId, { createdBy: 1, gstin: 1, pan: 1 }).lean()
  if (!self?.createdBy) return false
  const filter = freeDuplicateFilter({ userId: self.createdBy, gstin: self.gstin ?? undefined, pan: self.pan ?? undefined })
  return Boolean(await Org.exists({ ...filter, _id: { $ne: orgId } }))
}

/** Puts a Trial workspace trimmed to 5 people back on Free until its 6 months end. */
export async function returnToFree(target: OrgDb, org: OrgLike, now: Date = new Date(), config: Pick<PlanConfig, 'freeSeats'> = DEFAULT_PLAN_CONFIG): Promise<SwitchResult<FreeReturnRefusal>> {
  const seats = billableSeats(await usageOf(target))
  const refusal = freeReturnRefusal(org, seats, now, config.freeSeats)
  if (refusal) return { ok: false, reason: refusal }
  if (await freeTakenElsewhere(target.orgId)) return { ok: false, reason: 'duplicate' }
  const fields = freeReturnFields(org, now, config.freeSeats)
  const res = await Org.updateOne({ _id: target.orgId, 'subscription.plan': 'trial', 'subscription.accountType': { $ne: 'free' } }, { $set: subscriptionSet(fields), $unset: { 'subscription.endedAt': 1 } })
  return res.modifiedCount && fields.trialEndsAt ? { ok: true, endsAt: fields.trialEndsAt } : { ok: false, reason: 'not_trial' }
}
