import 'server-only'
import { isValidObjectId, Types } from 'mongoose'
import type { Ctx } from '@/lib/ctx'
import { formatMonth } from '@/lib/dates'
import { AttendancePeriod } from '@/models/muster/AttendancePeriod'
import { PayrollCycle } from '@/models/muster/PayrollCycle'
import { SalaryComponent } from '@/models/muster/SalaryComponent'
import { SalaryStructure } from '@/models/muster/SalaryStructure'
import { StatutoryVersion } from '@/models/muster/StatutoryVersion'
import { readStatutory } from './statutory'
import type { ComponentLike } from './structure-lines'
import { statutoryBlock, statutoryForMonth } from './timeline'

type DbCtx = Pick<Ctx, 'db'>

export const cycleMonth = (c: { year: number; month: number }): string => `${c.year}-${String(c.month).padStart(2, '0')}`
export const cycleLabel = (c: { year: number; month: number }): string => formatMonth(cycleMonth(c))

export async function getCycle(ctx: DbCtx, id: string) {
  if (!isValidObjectId(id)) return null
  return ctx.db(PayrollCycle).findById(id).lean()
}
export type CycleRecord = NonNullable<Awaited<ReturnType<typeof getCycle>>>

export async function componentMap(ctx: DbCtx): Promise<Map<string, ComponentLike>> {
  const rows = await ctx.db(SalaryComponent).find({}).lean()
  return new Map(rows.map((c) => [c.code, c]))
}

/** The structure in force on a day for each person (effectiveFrom ≤ day, not ended before it). */
export async function structuresOn(ctx: DbCtx, employeeIds: Types.ObjectId[], day: string) {
  const rows = await ctx.db(SalaryStructure)
    .find({ employeeId: { $in: employeeIds }, effectiveFrom: { $lte: day }, $or: [{ effectiveTo: null }, { effectiveTo: { $gte: day } }] })
    .sort({ effectiveFrom: 1 })
    .lean()
  return new Map(rows.map((s) => [String(s.employeeId), s]))
}

export type StructureRecord = Awaited<ReturnType<typeof structuresOn>> extends Map<string, infer S> ? S : never

/** Open structures (effectiveTo null) for each person. */
export async function currentStructures(ctx: DbCtx, employeeIds?: Types.ObjectId[]) {
  const rows = await ctx.db(SalaryStructure).find({ effectiveTo: null, ...(employeeIds ? { employeeId: { $in: employeeIds } } : {}) }).lean()
  return new Map(rows.map((s) => [String(s.employeeId), s]))
}

export async function statutoryVersions(ctx: DbCtx) {
  return ctx.db(StatutoryVersion).find({}).sort({ effectiveFrom: -1, createdAt: -1 }).lean()
}

/** The version payroll uses for a month, with parsed settings and why payroll cannot use it (null when it can). */
export async function statutoryFor(ctx: DbCtx, year: number, month: number) {
  const versions = await statutoryVersions(ctx)
  const version = statutoryForMonth(versions, year, month)
  const read = version ? readStatutory(version.settings) : null
  return { versions, version, settings: read?.settings ?? null, block: statutoryBlock(version, year, month, read?.unreadable) }
}

export async function attendanceLocked(ctx: DbCtx, year: number, month: number): Promise<boolean> {
  return Boolean(await ctx.db(AttendancePeriod).exists({ year, month, status: 'locked' }))
}

type StageRow = { _id: unknown; year: number; month: number; status: string }

/**
 * The payroll list's view of the attendance gate: a month still "attendance open" whose attendance is locked
 * (or "attendance locked" whose attendance was reopened) is moved to the right stage, so the list never waits
 * for someone to open the month page. One query for all months.
 */
export async function syncAttendanceStages<T extends StageRow>(ctx: DbCtx, cycles: T[]): Promise<T[]> {
  const gated = cycles.filter((c) => c.status === 'attendance_open' || c.status === 'attendance_locked')
  if (!gated.length) return cycles
  const lockedRows = await ctx.db(AttendancePeriod).find({ status: 'locked', $or: gated.map((c) => ({ year: c.year, month: c.month })) }, { year: 1, month: 1 }).lean()
  const locked = new Set(lockedRows.map((p) => `${p.year}-${p.month}`))
  const targetOf = (c: T) => {
    const isLocked = locked.has(`${c.year}-${c.month}`)
    if (c.status === 'attendance_open' && isLocked) return 'attendance_locked'
    if (c.status === 'attendance_locked' && !isLocked) return 'attendance_open'
    return null
  }
  return Promise.all(
    cycles.map(async (c) => {
      const target = targetOf(c)
      if (!target) return c
      await ctx.db(PayrollCycle).updateOne({ _id: c._id, status: c.status }, { $set: { status: target } })
      return { ...c, status: target }
    }),
  )
}
