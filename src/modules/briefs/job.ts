import 'server-only'
import { todayIST } from '@/lib/dates'
import type { SystemDb } from '@/lib/platform'
import { Brief } from '@/models/messaging/Brief'
import { dueDate, type BriefSchedule } from './schedule'
import { memberCtxFor, sendBrief } from './send'

/**
 * The /api/cron/briefs job (every 15 minutes): sends each brief whose time
 * has come today in IST, once. A brief is claimed (lastSentFor = today)
 * before it is built, so overlapping runs never send it twice.
 */

const TIME_BUDGET_MS = 200_000
const MAX_PER_RUN = 2000

export type BriefsJobResult = { due: number; sent: number; empty: number; skipped: number; failed: number; outOfTime: boolean }

export const scheduleOf = (b: { time?: string | null; days?: number[] | null; frequency?: string | null; weekday?: number | null }): BriefSchedule => ({
  time: b.time ?? '08:30',
  days: b.days ?? [],
  frequency: (b.frequency as BriefSchedule['frequency']) ?? 'daily',
  weekday: b.weekday ?? 1,
})

export async function runBriefsJob(db: SystemDb, now: Date = new Date()): Promise<BriefsJobResult> {
  const started = Date.now()
  const today = todayIST(now)
  const result: BriefsJobResult = { due: 0, sent: 0, empty: 0, skipped: 0, failed: 0, outOfTime: false }
  const candidates = await db.raw(Brief).find({ enabled: true, lastSentFor: { $ne: today } }).sort({ time: 1 }).limit(MAX_PER_RUN).lean()
  for (const brief of candidates) {
    if (!dueDate(scheduleOf(brief), brief.lastSentFor, now)) continue
    if (Date.now() - started > TIME_BUDGET_MS) {
      result.outOfTime = true
      break
    }
    result.due++
    const claimed = await db.raw(Brief).updateOne({ _id: brief._id, lastSentFor: { $ne: today } }, { $set: { lastSentFor: today, lastSentAt: now } })
    if (!claimed.modifiedCount) continue
    try {
      const ctx = await memberCtxFor(brief.orgId, brief.userId)
      if (!ctx) {
        result.skipped++
        continue
      }
      const outcome = await sendBrief(ctx, brief, { today, now })
      if (outcome.status === 'empty') {
        result.empty++
        await db.raw(Brief).updateOne({ _id: brief._id }, { $set: { lastSkippedFor: today } })
      } else result.sent++
    } catch (error) {
      result.failed++
      console.error(`[briefs] brief ${String(brief._id)} failed`, error)
    }
  }
  return result
}
