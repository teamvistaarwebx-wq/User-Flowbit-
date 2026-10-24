import 'server-only'
import { Types } from 'mongoose'
import { officeHoursOf } from '@/lib/attendance'
import type { Ctx } from '@/lib/ctx'
import { AttendanceDay } from '@/models/AttendanceDay'
import { getRegister } from './queries'
import { checkInCurve, presentSeries, tallyCells, type Point, type ResolvedRange, type Tally } from './range'

export type AttendanceTrend = {
  range: ResolvedRange
  tally: Tally
  points: Point[]
  /** Today plots people checked in by the hour; longer ranges plot present %. */
  unit: 'people' | 'percent'
  people: number
}

/** Figures and the chart line for a range, for everyone the viewer may see. */
export async function attendanceTrend(ctx: Ctx, range: ResolvedRange, opts: { departmentId?: string } = {}): Promise<AttendanceTrend> {
  const register = await getRegister(ctx, { start: range.start, end: range.end }, opts)
  const tally = tallyCells(register.rows.flatMap((r) => r.cells))
  if (range.bucket !== 'hour') return { range, tally, points: presentSeries(register.rows, range.bucket), unit: 'percent', people: register.rows.length }
  const memberIds = register.rows.flatMap((r) => (r.memberId ? [new Types.ObjectId(r.memberId)] : []))
  const days = memberIds.length ? await ctx.db(AttendanceDay).find({ memberId: { $in: memberIds }, date: range.start }, { firstIn: 1, punches: 1 }).lean() : []
  const firstIns = days
    .map((d) => d.firstIn ?? d.punches?.find((p) => p.type === 'in')?.at ?? null)
    .filter((at): at is Date => Boolean(at))
  return { range, tally, points: checkInCurve(firstIns, officeHoursOf(ctx), new Date()), unit: 'people', people: register.rows.length }
}
