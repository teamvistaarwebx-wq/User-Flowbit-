import 'server-only'
import type { Types } from 'mongoose'
import { computeDay, DEFAULT_OFFICE_HOURS, type OfficeHours } from '@/lib/attendance-core'
import type { Ctx } from '@/lib/ctx'
import { AttendanceDay } from '@/models/AttendanceDay'
import { AttendanceCorrection } from '@/models/muster/AttendanceCorrection'
import type { OverrideStatus } from './register'

/** Mirrors an attendance status onto the core AttendanceDay of a linked member (punches kept). */
export async function writeCoreDay(ctx: Ctx, employee: { _id: Types.ObjectId; memberId?: Types.ObjectId | null }, date: string, status: OverrideStatus, note: string): Promise<void> {
  if (!employee.memberId) return
  await ctx.db(AttendanceDay).updateOne(
    { memberId: employee.memberId, date },
    { $set: { status, note, correctedBy: ctx.userId, employeeId: employee._id }, $setOnInsert: { punches: [], workedMinutes: 0, breakMinutes: 0 } },
    { upsert: true },
  )
}

/**
 * Undoes `writeCoreDay` after an override is removed: the day goes back to
 * what its check-ins say (an empty day is then judged by the calendar and the
 * unmarked-day policy, as before the override).
 */
export async function resetCoreDay(ctx: Ctx, employee: { memberId?: Types.ObjectId | null }, date: string): Promise<void> {
  if (!employee.memberId) return
  const day = await ctx.db(AttendanceDay).findOne({ memberId: employee.memberId, date }).lean()
  if (!day) return
  const hours = { ...DEFAULT_OFFICE_HOURS, ...(ctx.org.officeHours ?? {}) } as OfficeHours
  const result = computeDay({ punches: day.punches ?? [] }, hours)
  await ctx.db(AttendanceDay).updateOne({ _id: day._id }, { $set: { status: result.status }, $unset: { note: 1, correctedBy: 1 } })
}

/** Retires earlier approved changes to the same day so the newest one wins. */
export async function supersede(ctx: Ctx, employeeId: Types.ObjectId, date: string, keepId?: Types.ObjectId): Promise<void> {
  await ctx.db(AttendanceCorrection).updateMany({ employeeId, date, status: 'approved', ...(keepId ? { _id: { $ne: keepId } } : {}) }, { $set: { status: 'superseded' } })
}
