import 'server-only'
import { Types } from 'mongoose'
import { audit } from '@/lib/audit'
import type { Ctx } from '@/lib/ctx'
import { Employee } from '@/models/muster/Employee'
import { DIRECTORY_STATUSES, WORK_MODE_LABEL, workModeOf, type WorkMode } from './lifecycle'
import { mayDecideOwn, ownEmployeeId, visibleEmployeeIds, visibleFilter } from './scope'

/** Office or remote per employee: remote people are never asked for a location at check-in (lib/attendance checkInGeoFor). */

/** Audited on its own, because switching someone to remote turns their location check off. */
export async function auditWorkModeChange(ctx: Ctx, employee: { _id: Types.ObjectId | string; fullName: string; workMode?: string | null }, to: WorkMode): Promise<void> {
  const from = workModeOf(employee.workMode)
  await audit(ctx, { action: 'employee.work_mode_changed', entity: 'Employee', entityId: employee._id, summary: `${employee.fullName}: ${WORK_MODE_LABEL[from]} → ${WORK_MODE_LABEL[to]}`, product: 'muster', meta: { from, to } })
}

export type WorkModeRow = { id: string; name: string; code: string; department: string | null; workMode: WorkMode }

/** Everyone in the directory this person may see, with their work mode, for the "Work mode" dialog. */
export async function workModeRows(ctx: Ctx, departments: Map<string, string>): Promise<WorkModeRow[]> {
  const ids = await visibleEmployeeIds(ctx)
  const rows = await ctx.db(Employee).find({ deletedAt: null, status: { $in: DIRECTORY_STATUSES }, ...visibleFilter(ids) }, { fullName: 1, code: 1, departmentId: 1, workMode: 1 }).sort({ fullName: 1 }).lean()
  return rows.map((r) => ({ id: String(r._id), name: r.fullName, code: r.code, department: r.departmentId ? (departments.get(String(r.departmentId)) ?? null) : null, workMode: workModeOf(r.workMode) }))
}

/** How many people in the directory work remotely (the location settings card names it). */
export const remoteCount = (ctx: Ctx): Promise<number> => ctx.db(Employee).countDocuments({ deletedAt: null, status: { $in: DIRECTORY_STATUSES }, workMode: 'remote' })

/**
 * Sets the work mode of many people at once. Only records this person may see change; their own record is
 * skipped unless they may decide their own matters. Returns how many changed and how many were skipped.
 */
export async function setWorkModes(ctx: Ctx, ids: string[], to: WorkMode): Promise<{ changed: number; skippedOwn: boolean }> {
  const own = ownEmployeeId(ctx)
  const skippedOwn = Boolean(own && ids.includes(own) && !mayDecideOwn(ctx))
  const wanted = ids.filter((id) => !(skippedOwn && id === own)).map((id) => new Types.ObjectId(id))
  if (!wanted.length) return { changed: 0, skippedOwn }
  const visible = await visibleEmployeeIds(ctx)
  // An unset mode already counts as office, so only records that would really change are touched and audited.
  const differs = to === 'office' ? { workMode: 'remote' } : { workMode: { $ne: 'remote' } }
  const targets = await ctx.db(Employee).find({ _id: { $in: wanted }, deletedAt: null, ...visibleFilter(visible), ...differs }, { fullName: 1, workMode: 1 }).lean()
  if (!targets.length) return { changed: 0, skippedOwn }
  await ctx.db(Employee).updateMany({ _id: { $in: targets.map((t) => t._id) } }, { $set: { workMode: to } })
  for (const t of targets) await auditWorkModeChange(ctx, t, to)
  return { changed: targets.length, skippedOwn }
}
