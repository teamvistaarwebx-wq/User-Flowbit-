import 'server-only'
import type { Types } from 'mongoose'
import type { Ctx } from '@/lib/ctx'
import { todayIST } from '@/lib/dates'
import { TimeEntry } from '@/models/work/TimeEntry'
import { Timesheet } from '@/models/work/Timesheet'
import { labelTargets, targetKeyOf } from './targets'

export async function runningEntry(ctx: Ctx, memberId: Types.ObjectId = ctx.memberId) {
  const entry = await ctx.db(TimeEntry).findOne({ memberId, isRunning: true }).lean()
  if (!entry) return null
  const labels = await labelTargets(ctx, [entry])
  const label = labels.get(targetKeyOf(entry))
  return { id: String(entry._id), startedAt: (entry.startedAt ?? entry.createdAt).toISOString(), label: label?.label ?? 'Untitled', sub: label?.sub, taskId: label?.taskId, note: entry.note ?? '' }
}

export type WeekRow = { key: string; label: string; sub?: string; taskId?: string; days: Record<string, number>; total: number }
export type WeekEntry = { id: string; key: string; label: string; date: string; minutes: number; note: string; billable: boolean; source: string; isRunning: boolean }

/** A member's week: grid rows, flat entries and the timesheet status. */
export async function weekData(ctx: Ctx, memberId: Types.ObjectId, weekStart: string) {
  const [entries, sheet] = await Promise.all([
    ctx.db(TimeEntry).find({ memberId, weekStart }).sort({ date: 1, createdAt: 1 }).lean(),
    ctx.db(Timesheet).findOne({ memberId, weekStart }).lean(),
  ])
  const labels = await labelTargets(ctx, entries)
  const rows = new Map<string, WeekRow>()
  const list: WeekEntry[] = []
  for (const e of entries) {
    const key = targetKeyOf(e)
    const label = labels.get(key)
    const row = rows.get(key) ?? { key, label: label?.label ?? 'Removed item', sub: label?.sub, taskId: label?.taskId, days: {}, total: 0 }
    row.days = { ...row.days, [e.date]: (row.days[e.date] ?? 0) + e.minutes }
    row.total += e.minutes
    rows.set(key, row)
    list.push({ id: String(e._id), key, label: row.label, date: e.date, minutes: e.minutes, note: e.note ?? '', billable: e.billable, source: e.source, isRunning: e.isRunning })
  }
  const total = entries.reduce((s, e) => s + e.minutes, 0)
  const billable = entries.filter((e) => e.billable).reduce((s, e) => s + e.minutes, 0)
  return {
    rows: [...rows.values()],
    entries: list,
    total,
    billable,
    sheet: sheet ? { id: String(sheet._id), status: sheet.status, reason: sheet.reason ?? '', submittedAt: sheet.submittedAt?.toISOString() } : null,
  }
}

export async function todayMinutes(ctx: Ctx): Promise<number> {
  const rows = await ctx.db(TimeEntry).find({ memberId: ctx.memberId, date: todayIST() }, { minutes: 1 }).lean()
  return rows.reduce((s, e) => s + e.minutes, 0)
}
