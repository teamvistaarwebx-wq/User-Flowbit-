'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { action, fail, ok } from '@/lib/actions'
import type { Ctx } from '@/lib/ctx'
import { formatDuration, todayIST } from '@/lib/dates'
import { NotFoundError } from '@/lib/errors'
import { checkbox, isoDate, objectId, optionalText } from '@/lib/validation'
import { TimeEntry } from '@/models/work/TimeEntry'
import { parseDuration } from './format'
import { assertDayRoom, assertWeekOpen, bumpTask, longRunningMinutes, stopRunning, syncWeek } from './ledger'
import { resolveTarget } from './targets'

const W = { product: 'work', perm: 'time.write' } as const
const target = z.string({ error: 'Pick a task or project' }).regex(/^(task|project):[a-f0-9]{24}$/, 'Pick a task or project')
const duration = z.string().trim().refine((v) => parseDuration(v) !== null, 'Use a time like 1:30, 1h 30m or 90m')

const refresh = () => {
  revalidatePath('/app/work/time')
  revalidatePath('/app/work/time/approvals')
}

export const startTimer = action(
  z.object({ target, note: optionalText(500) }),
  async ({ target: key, note }, ctx) => {
    const today = todayIST()
    const weekStart = await assertWeekOpen(ctx, ctx.memberId, today)
    const t = await resolveTarget(ctx, key)
    const long = await longRunningMinutes(ctx, ctx.memberId)
    if (long !== null) return fail(`Your last timer has been running for ${formatDuration(long)}. Stop it first and check the time it logs.`)
    const stopped = await stopRunning(ctx, ctx.memberId)
    await ctx.db(TimeEntry).create({ memberId: ctx.memberId, taskId: t.taskId, projectId: t.projectId, date: today, weekStart, minutes: 0, source: 'timer', startedAt: new Date(), isRunning: true, note, billable: t.billable, status: 'draft' })
    refresh()
    return ok(stopped ? `Stopped the last timer (${formatDuration(stopped.minutes)}). Timer running on '${t.label}'` : `Timer running on '${t.label}'`)
  },
  W,
)

export const stopTimer = action(
  z.object({ confirmLong: z.boolean().optional() }),
  async ({ confirmLong }, ctx) => {
    const long = await longRunningMinutes(ctx, ctx.memberId)
    if (long !== null && !confirmLong) return fail(`This timer has been running for ${formatDuration(long)}. Confirm to log it, or stop it and fix the time in the entries list.`)
    const stopped = await stopRunning(ctx, ctx.memberId)
    if (!stopped) return fail('No timer is running.')
    refresh()
    return ok(`Timer stopped: ${formatDuration(stopped.minutes)} logged`)
  },
  W,
)

export const logTime = action(
  z.object({ target, date: isoDate, duration, note: optionalText(500), billable: checkbox }),
  async (input, ctx) => {
    const minutes = parseDuration(input.duration) ?? 0
    if (minutes <= 0) return fail('Some fields need attention.', { duration: 'Total time must be greater than 0' })
    if (input.date > todayIST()) return fail('Some fields need attention.', { date: "You can't log time in the future" })
    const weekStart = await assertWeekOpen(ctx, ctx.memberId, input.date)
    const t = await resolveTarget(ctx, input.target)
    await assertDayRoom(ctx, ctx.memberId, input.date, minutes)
    await ctx.db(TimeEntry).create({ memberId: ctx.memberId, taskId: t.taskId, projectId: t.projectId, date: input.date, weekStart, minutes, source: 'manual', note: input.note, billable: input.billable, status: 'draft' })
    await bumpTask(ctx, t.taskId, minutes)
    await syncWeek(ctx, ctx.memberId, weekStart)
    refresh()
    return ok(`Logged ${formatDuration(minutes)} on '${t.label}'`)
  },
  W,
)

/** Own entries only; running timers are locked until stopped. */
async function ownEntry(ctx: Ctx, id: string) {
  const entry = await ctx.db(TimeEntry).findOne({ _id: id, memberId: ctx.memberId }).lean()
  if (!entry) throw new NotFoundError('That time entry')
  return entry
}

export const updateEntry = action(
  z.object({ id: objectId, duration, note: optionalText(500), billable: checkbox }),
  async (input, ctx) => {
    const entry = await ownEntry(ctx, input.id)
    if (entry.isRunning) return fail('Cannot edit a running timer. Stop it first.')
    await assertWeekOpen(ctx, ctx.memberId, entry.date)
    const minutes = parseDuration(input.duration) ?? 0
    if (minutes <= 0) return fail('Some fields need attention.', { duration: 'Total time must be greater than 0' })
    await assertDayRoom(ctx, ctx.memberId, entry.date, minutes, [entry._id])
    await ctx.db(TimeEntry).updateOne({ _id: entry._id }, { $set: { minutes, note: input.note, billable: input.billable, editedAt: new Date() } })
    await bumpTask(ctx, entry.taskId, minutes - entry.minutes)
    await syncWeek(ctx, ctx.memberId, entry.weekStart)
    refresh()
    return ok('Time entry updated')
  },
  W,
)

export const deleteEntry = action(
  z.object({ id: objectId }),
  async ({ id }, ctx) => {
    const entry = await ownEntry(ctx, id)
    if (entry.isRunning) return fail('Cannot delete a running timer. Stop it first.')
    await assertWeekOpen(ctx, ctx.memberId, entry.date)
    await ctx.db(TimeEntry).deleteOne({ _id: entry._id })
    await bumpTask(ctx, entry.taskId, -entry.minutes)
    await syncWeek(ctx, ctx.memberId, entry.weekStart)
    refresh()
    return ok(`Removed ${formatDuration(entry.minutes)}`)
  },
  W,
)

/**
 * Timesheet grid cell: sets the day's total for a row. Timer time stays as
 * logged; the difference goes into one manual entry for that cell.
 */
export const setCell = action(
  z.object({ target, date: isoDate, duration }),
  async (input, ctx) => {
    const total = parseDuration(input.duration) ?? 0
    if (input.date > todayIST() && total > 0) return fail("You can't log time in the future")
    const weekStart = await assertWeekOpen(ctx, ctx.memberId, input.date)
    const t = await resolveTarget(ctx, input.target)
    const cell = { memberId: ctx.memberId, date: input.date, ...(t.taskId ? { taskId: t.taskId } : { projectId: t.projectId, taskId: { $exists: false } }) }
    const entries = await ctx.db(TimeEntry).find(cell).sort({ createdAt: 1 }).lean()
    if (entries.some((e) => e.isRunning)) return fail('A timer is running on this row. Stop it first.')
    const timerSum = entries.filter((e) => e.source === 'timer').reduce((s, e) => s + e.minutes, 0)
    if (total < timerSum) return fail(`This day has ${formatDuration(timerSum)} from timers. Edit those in the entries list.`)
    await assertDayRoom(ctx, ctx.memberId, input.date, total, entries.map((e) => e._id))
    const manual = entries.filter((e) => e.source === 'manual')
    const before = entries.reduce((s, e) => s + e.minutes, 0)
    const manualTarget = total - timerSum
    const [keep, ...extra] = manual
    if (extra.length) await ctx.db(TimeEntry).deleteMany({ _id: { $in: extra.map((e) => e._id) } })
    if (keep && manualTarget > 0) await ctx.db(TimeEntry).updateOne({ _id: keep._id }, { $set: { minutes: manualTarget, editedAt: new Date() } })
    else if (keep) await ctx.db(TimeEntry).deleteOne({ _id: keep._id })
    else if (manualTarget > 0) await ctx.db(TimeEntry).create({ memberId: ctx.memberId, taskId: t.taskId, projectId: t.projectId, date: input.date, weekStart, minutes: manualTarget, source: 'manual', billable: t.billable, status: 'draft' })
    await bumpTask(ctx, t.taskId, total - before)
    await syncWeek(ctx, ctx.memberId, weekStart)
    refresh()
    return ok()
  },
  W,
)

export const setBillable = action(
  z.object({ id: objectId, billable: z.boolean() }),
  async ({ id, billable }, ctx) => {
    const entry = await ownEntry(ctx, id)
    await assertWeekOpen(ctx, ctx.memberId, entry.date)
    await ctx.db(TimeEntry).updateOne({ _id: entry._id }, { $set: { billable } })
    await syncWeek(ctx, ctx.memberId, entry.weekStart)
    refresh()
    return ok(billable ? 'Marked billable' : 'Marked non-billable')
  },
  W,
)
