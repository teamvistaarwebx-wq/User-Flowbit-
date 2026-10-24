import 'server-only'
import type { ClientSession, Types } from 'mongoose'
import { computeDay } from '@/lib/attendance-core'
import { officeHoursOf } from '@/lib/attendance'
import type { Ctx } from '@/lib/ctx'
import { istInstant } from '@/lib/dates'
import { AttendanceDay } from '@/models/AttendanceDay'
import { AttendanceCorrection } from '@/models/muster/AttendanceCorrection'
import type { OverrideStatus } from './register'

export type MarkWrite = {
  employeeId: Types.ObjectId
  memberId?: Types.ObjectId | null
  date: string
  status: OverrideStatus
  reason: string
  /** 'HH:MM' check-in and check-out, stored as punches on a linked member's day. */
  times?: { in?: string; out?: string }
}

const opts = (session?: ClientSession) => (session ? { session } : undefined)

function punchesOf(m: MarkWrite) {
  const punches = []
  if (m.times?.in) punches.push({ type: 'in' as const, at: istInstant(m.date, m.times.in), source: 'admin' as const, note: 'Imported' })
  if (m.times?.in && m.times.out) punches.push({ type: 'out' as const, at: istInstant(m.date, m.times.out), source: 'admin' as const, note: 'Imported' })
  return punches
}

/** Punches and worked time from imported in/out times, or null when there are none. */
function timedFields(ctx: Ctx, m: MarkWrite) {
  const punches = punchesOf(m)
  if (!punches.length) return null
  // With only a check-in, measure nothing after it (a past day must not count up to now).
  const day = computeDay({ punches, status: m.status }, officeHoursOf(ctx), punches[punches.length - 1].at)
  return { punches, workedMinutes: day.workedMinutes, breakMinutes: day.breakMinutes, firstIn: day.firstIn ?? undefined, lastOut: day.lastOut ?? undefined }
}

/** The core-day update for a mark (status, note and any imported punches and worked time). */
function coreDayUpdate(ctx: Ctx, m: MarkWrite) {
  const timed = timedFields(ctx, m)
  const base = { status: m.status, note: m.reason, correctedBy: ctx.userId, employeeId: m.employeeId }
  return timed ? { $set: { ...base, ...timed } } : { $set: base, $setOnInsert: { punches: [], workedMinutes: 0, breakMinutes: 0 } }
}

/**
 * Mirrors marks onto the linked members' core days (the home dashboard and check-in widget read them)
 * in one bulk write, so a large import stays one round trip inside its transaction. The filters carry
 * the workspace, as ctx.db does. Returns the ids of the days it created.
 */
async function writeCoreDays(ctx: Ctx, marks: readonly MarkWrite[], session?: ClientSession): Promise<Types.ObjectId[]> {
  const linked = marks.filter((m) => m.memberId)
  if (!linked.length) return []
  const ops = linked.map((m) => ({ updateOne: { filter: { orgId: ctx.orgId, memberId: m.memberId, date: m.date }, update: coreDayUpdate(ctx, m), upsert: true } }))
  const result = await AttendanceDay.bulkWrite(ops as never, { ordered: true, ...(session ? { session } : {}) })
  return Object.values(result.upsertedIds ?? {}) as Types.ObjectId[]
}

/** What writeMarks created: the new overrides and the core days that did not exist before. */
export type MarksWritten = { correctionIds: Types.ObjectId[]; newDayIds: Types.ObjectId[] }

/**
 * Writes marks as approved overrides (the newest for a person and day wins,
 * earlier ones are superseded) and mirrors them onto linked members' days.
 * Callers check visibility, employment and the month lock first.
 */
export async function writeMarks(ctx: Ctx, marks: readonly MarkWrite[], source: 'daily' | 'import', session?: ClientSession): Promise<MarksWritten> {
  if (!marks.length) return { correctionIds: [], newDayIds: [] }
  await ctx.db(AttendanceCorrection).updateMany({ status: 'approved', $or: marks.map((m) => ({ employeeId: m.employeeId, date: m.date })) }, { $set: { status: 'superseded' } }, opts(session))
  const decidedAt = new Date()
  const signer = { decidedBy: ctx.userId, decidedByName: ctx.user.name }
  const inserted = await ctx.db(AttendanceCorrection).insertMany(
    marks.map((m) => ({
      employeeId: m.employeeId, memberId: m.memberId ?? undefined, date: m.date, kind: 'override' as const, source, requestedStatus: m.status, reason: m.reason, status: 'approved' as const,
      stages: ['hr'], completedStages: ['hr'], decisions: [{ stage: 'hr', decision: 'approved' as const, ...signer, decidedAt, note: m.reason }],
      raisedBy: ctx.userId, raisedByName: ctx.user.name, decidedAt,
    })),
    opts(session),
  )
  const newDayIds = await writeCoreDays(ctx, marks, session)
  return { correctionIds: inserted.map((c) => c._id as Types.ObjectId), newDayIds }
}
