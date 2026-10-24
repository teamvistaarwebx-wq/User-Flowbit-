import 'server-only'
import type { Types } from 'mongoose'
import { isoDateIST } from '@/lib/dates'
import { canWrite } from '@/lib/entitlements'
import type { SystemDb } from '@/lib/platform'
import type { ProductKey } from '@/lib/catalog'
import { Automation } from '@/models/automations/Automation'
import { AutomationRun } from '@/models/automations/AutomationRun'
import { CronLock } from '@/models/CronLock'
import { Org } from '@/models/Org'
import { startRun } from './engine'
import { executeRun } from './execute'
import { SOURCE_TRIGGERS } from './catalog'
import { recipeByKey } from './recipes'
import { ensureRecipes } from './seed'
import { orgScope } from './sources/common'
import { SOURCES } from './sources'
import { dateWindow, scanDue, scheduleOccurrence } from './timing'
import type { SourceKey, Trigger } from './types'

/**
 * /api/cron/automations (every 5 minutes): runs whose delay is over, then
 * the time triggers: meeting reminders every run, hour-based rules every
 * 30 minutes, day-based rules once a day from 09:00 IST, schedules when
 * their time comes. Every run is deduplicated per record, so overlapping
 * or repeated scans never message anyone twice.
 */

const TIME_BUDGET_MS = 200_000
const DUE_BATCH = 200
const STALE_RUNNING_MS = 10 * 60_000

const SOURCE_PRODUCT = (key: SourceKey): ProductKey => SOURCE_TRIGGERS[key].product

export type AutomationsJobResult = { executed: number; interrupted: number; scanned: number; started: number; seededOrgs: number; outOfTime: boolean }

async function runDue(now: Date, deadline: number, result: AutomationsJobResult): Promise<void> {
  const stale = await AutomationRun.updateMany({ status: 'running', updatedAt: { $lt: new Date(now.getTime() - STALE_RUNNING_MS) } }, { $set: { status: 'failed', note: 'Interrupted before it finished; not retried, to avoid a double send.', finishedAt: now } })
  result.interrupted = stale.modifiedCount
  const due = await AutomationRun.find({ status: 'scheduled', dueAt: { $lte: now } }, { _id: 1 }).sort({ dueAt: 1 }).limit(DUE_BATCH).lean()
  for (const run of due) {
    if (Date.now() > deadline) {
      result.outOfTime = true
      return
    }
    if (await executeRun(run._id)) result.executed++
  }
}

/** Seeds the ready recipes for every live workspace once a day, so default-on rules work before anyone opens the settings. */
async function seedOnceADay(db: SystemDb, now: Date): Promise<number> {
  const today = isoDateIST(now)
  try {
    // Matches only when today's seeding has not run; when it has, the upsert's insert hits the _id and is refused.
    await CronLock.updateOne({ _id: 'automations-seed', runAsOf: { $ne: today } }, { $set: { runAsOf: today } }, { upsert: true })
  } catch (error) {
    if ((error as { code?: number } | null)?.code === 11000) return 0
    throw error
  }
  const orgs = await db.raw(Org).find({ deletedAt: null, disabled: { $ne: true } }, { _id: 1 }).lean()
  for (const org of orgs) await ensureRecipes(org._id)
  return orgs.length
}

type OrgLite = Parameters<typeof canWrite>[0] & { _id: Types.ObjectId; name: string }

async function scanRule(rule: Awaited<ReturnType<typeof loadTimeRules>>[number], org: OrgLite, now: Date, result: AutomationsJobResult): Promise<void> {
  const trigger = rule.trigger as Trigger
  const source = trigger.source ? SOURCES[trigger.source] : undefined
  if (!source || !trigger.source || !canWrite(org, SOURCE_PRODUCT(trigger.source), now)) return
  const occurrence = trigger.type === 'schedule' ? scheduleOccurrence(trigger, now, rule.lastOccurrence) : null
  if (trigger.type === 'schedule' && !occurrence) return
  const subjects = await source(orgScope(org._id, org.name), { window: trigger.type === 'date' ? dateWindow(trigger, now) : null, now })
  result.scanned++
  for (const subject of subjects) {
    if (await startRun(rule, occurrence ? { ...subject, occurrence } : subject, { now })) result.started++
  }
  await Automation.updateOne({ _id: rule._id }, { $set: { lastScanAt: now, ...(occurrence ? { lastOccurrence: occurrence } : {}) } })
}

const loadTimeRules = () => Automation.find({ enabled: true, 'trigger.type': { $in: ['date', 'schedule'] } }).lean()

export async function runAutomationsJob(db: SystemDb, now: Date = new Date()): Promise<AutomationsJobResult> {
  const deadline = Date.now() + TIME_BUDGET_MS
  const result: AutomationsJobResult = { executed: 0, interrupted: 0, scanned: 0, started: 0, seededOrgs: 0, outOfTime: false }
  await runDue(now, deadline, result)
  result.seededOrgs = await seedOnceADay(db, now)
  const rules = (await loadTimeRules()).filter((r) => !recipeByKey(r.recipeKey)?.bridge && scanDue(r.trigger as Trigger, r.lastScanAt, now))
  const orgs = new Map((await db.raw(Org).find({ _id: { $in: [...new Set(rules.map((r) => String(r.orgId)))] }, deletedAt: null, disabled: { $ne: true } }).lean()).map((o) => [String(o._id), o as unknown as OrgLite]))
  for (const rule of rules) {
    if (Date.now() > deadline) {
      result.outOfTime = true
      break
    }
    const org = orgs.get(String(rule.orgId))
    if (!org) continue
    try {
      await scanRule(rule, org, now, result)
    } catch (error) {
      console.error('[automations] scan failed', rule.recipeKey ?? String(rule._id), String(rule.orgId), error)
    }
  }
  return result
}
