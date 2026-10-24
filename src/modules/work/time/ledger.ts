import 'server-only'
import type { Types } from 'mongoose'
import type { Ctx } from '@/lib/ctx'
import { formatDuration, startOfWeek } from '@/lib/dates'
import { UserError } from '@/lib/errors'
import { Task } from '@/models/work/Task'
import { TimeEntry } from '@/models/work/TimeEntry'
import { Timesheet } from '@/models/work/Timesheet'
import { dayRoom, isLongTimer, timerMinutes } from './format'
import { isWeekEditable } from './week'

/** Throws when the member's week is submitted or approved. */
export async function assertWeekOpen(ctx: Ctx, memberId: Types.ObjectId, date: string): Promise<string> {
  const weekStart = startOfWeek(date)
  const sheet = await ctx.db(Timesheet).findOne({ memberId, weekStart }, { status: 1 }).lean()
  if (!isWeekEditable(sheet?.status)) throw new UserError('This week is submitted. Ask your manager to send it back to edit.')
  return weekStart
}

/** Keeps Task.loggedMinutes in step with time entries. */
export async function bumpTask(ctx: Ctx, taskId: unknown, delta: number): Promise<void> {
  if (!taskId || !delta) return
  await ctx.db(Task).updateOne({ _id: taskId }, { $inc: { loggedMinutes: delta } })
}

/** Recomputes the week's totals on its Timesheet (created as a draft when missing). */
export async function syncWeek(ctx: Ctx, memberId: Types.ObjectId, weekStart: string): Promise<void> {
  const entries = await ctx.db(TimeEntry).find({ memberId, weekStart }, { minutes: 1, billable: 1 }).lean()
  const totalMinutes = entries.reduce((s, e) => s + e.minutes, 0)
  const billableMinutes = entries.filter((e) => e.billable).reduce((s, e) => s + e.minutes, 0)
  await ctx.db(Timesheet).updateOne({ memberId, weekStart }, { $set: { totalMinutes, billableMinutes }, $setOnInsert: { status: 'draft' } }, { upsert: true })
}

/** Minutes the member has logged on a day, leaving out `excludeIds` (entries about to be replaced). */
export async function dayMinutes(ctx: Ctx, memberId: Types.ObjectId, date: string, excludeIds: unknown[] = []): Promise<number> {
  const rows = await ctx.db(TimeEntry).find({ memberId, date, ...(excludeIds.length ? { _id: { $nin: excludeIds } } : {}) }, { minutes: 1 }).lean()
  return rows.reduce((s, e) => s + e.minutes, 0)
}

/** Refuses a write that would put more than 24 h on one day. */
export async function assertDayRoom(ctx: Ctx, memberId: Types.ObjectId, date: string, adding: number, excludeIds: unknown[] = []): Promise<void> {
  const logged = await dayMinutes(ctx, memberId, date, excludeIds)
  if (adding > dayRoom(logged)) throw new UserError(`A day can't hold more than 24 h. ${date} already has ${formatDuration(logged)} logged.`, { duration: 'More than 24 h on this day' })
}

/**
 * The running timer's length when it looks forgotten (over 10 h or past midnight), else null.
 * Stopping such a timer needs an explicit confirm so a full day isn't billed by accident.
 */
export async function longRunningMinutes(ctx: Ctx, memberId: Types.ObjectId, now: Date = new Date()): Promise<number | null> {
  const running = await ctx.db(TimeEntry).findOne({ memberId, isRunning: true }, { startedAt: 1, createdAt: 1 }).lean()
  if (!running) return null
  const startedAt = running.startedAt ?? running.createdAt
  return isLongTimer(startedAt, now) ? timerMinutes(startedAt, now) : null
}

/** Stops the member's running timer (if any) and credits the time. Returns the stopped entry's minutes. */
export async function stopRunning(ctx: Ctx, memberId: Types.ObjectId): Promise<{ minutes: number; taskId?: unknown } | null> {
  const running = await ctx.db(TimeEntry).findOne({ memberId, isRunning: true }).lean()
  if (!running) return null
  const endedAt = new Date()
  // A timer is credited to its start day, which never goes past 24 h.
  const room = dayRoom(await dayMinutes(ctx, memberId, running.date, [running._id]))
  const minutes = Math.min(room, timerMinutes(running.startedAt ?? running.createdAt, endedAt))
  // Only the request that actually stops it credits the time (two tabs pressing Stop at once).
  const stopped = await ctx.db(TimeEntry).updateOne({ _id: running._id, isRunning: true }, { $set: { isRunning: false, endedAt, minutes } })
  if (!stopped.modifiedCount) return null
  await bumpTask(ctx, running.taskId, minutes)
  await syncWeek(ctx, memberId, running.weekStart)
  return { minutes, taskId: running.taskId }
}
