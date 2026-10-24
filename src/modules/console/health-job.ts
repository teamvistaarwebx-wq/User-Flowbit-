import 'server-only'
import type { Types } from 'mongoose'
import { eachOrg } from '@/lib/cron'
import type { SystemDb } from '@/lib/platform'
import { UsageEvent } from '@/models/console/UsageEvent'
import { ConsoleAccount } from '@/models/console/ConsoleAccount'
import { HEALTH_LOOKBACK_DAYS, healthOf, healthScoreDay, type HealthScore, type UsageRow } from './health'

const DAY_MS = 86_400_000

/** Usage of one workspace over the lookback, grouped by IST day, kind and person. */
async function usageRows(db: SystemDb, orgId: Types.ObjectId, now: Date): Promise<UsageRow[]> {
  const since = new Date(now.getTime() - (HEALTH_LOOKBACK_DAYS + 1) * DAY_MS)
  const rows = await db.raw(UsageEvent).aggregate<{ _id: { day: string; kind: UsageRow['kind']; userId: Types.ObjectId | null }; count: number }>([
    { $match: { orgId, at: { $gte: since } } },
    { $group: { _id: { day: { $dateToString: { format: '%Y-%m-%d', date: '$at', timezone: 'Asia/Kolkata' } }, kind: '$kind', userId: { $ifNull: ['$userId', null] } }, count: { $sum: 1 } } },
  ])
  return rows.map((r) => ({ day: r._id.day, kind: r._id.kind, userId: r._id.userId ? String(r._id.userId) : null, count: r.count }))
}

/**
 * Nightly health score (console spec 7.3) for every live workspace: stored
 * on its ConsoleAccount for the accounts list, Home and "Call today".
 */
export async function runHealthJob(db: SystemDb, asOf: string): Promise<Record<HealthScore, number>> {
  const now = new Date()
  const totals: Record<HealthScore, number> = { green: 0, amber: 0, red: 0 }
  const scoreDay = healthScoreDay(asOf)
  const outcomes = await eachOrg(db, 'health', () => true, async (org) => {
    const result = healthOf(await usageRows(db, org._id, now), scoreDay)
    await db.raw(ConsoleAccount).updateOne({ orgId: org._id }, { $set: { 'health.score': result.score, 'health.signals': result.signals, 'health.computedAt': now } }, { upsert: true })
    return result.score
  })
  for (const o of outcomes) if (o.result) totals[o.result] += 1
  return totals
}
