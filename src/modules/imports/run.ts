import 'server-only'
import type { Types } from 'mongoose'
import { audit } from '@/lib/audit'
import type { Ctx } from '@/lib/ctx'
import { entitlements } from '@/lib/entitlements'
import { NotFoundError, UserError } from '@/lib/errors'
import { ImportBatch } from '@/models/imports/ImportBatch'
import { assertCapacity, usageOf } from '@/modules/subscription/usage'
import { previewSummary, undoBatch, undoLockRefusal, undoRefusal } from './batch'
import { AttendanceDay } from '@/models/AttendanceDay'
import { AttendanceCorrection } from '@/models/muster/AttendanceCorrection'
import { AttendancePeriod } from '@/models/muster/AttendancePeriod'
import { PayrollEntry } from '@/models/muster/PayrollEntry'
import type { Created, Restore } from './types'
import { mongoUndoStore } from './batch-store'
import { recordBatch } from './record'
import type { AnyImporter } from './registry'
import { seatProblem } from './seats'
import type { Sheet } from './sheet'
import type { CheckedRow, ImportActor, ImportPreview } from './types'

/** Preview, confirm and undo for every importer (self-serve and staff-run share these). */

const PREVIEW_ROWS = 500

async function checked(importer: AnyImporter, sheet: Sheet, ctx: Ctx) {
  if (!sheet.headers.some(Boolean)) throw new UserError('The file has no header row. Download the template to see the layout.')
  if (sheet.cells.length > importer.maxRows) throw new UserError(`The file has ${sheet.cells.length} rows. Import at most ${importer.maxRows.toLocaleString('en-IN')} at a time.`)
  const result = await importer.check(sheet, ctx)
  if ('error' in result) throw new UserError(result.error)
  return result
}

const readyOf = <R>(rows: readonly CheckedRow<R>[]) => rows.flatMap((r) => (r.record ? [r.record] : []))

/** Checks every row and writes nothing. Warns when the people added would pass the plan's seat limit. */
export async function previewImport(importer: AnyImporter, sheet: Sheet, ctx: Ctx): Promise<ImportPreview> {
  const result = await checked(importer, sheet, ctx)
  const ready = readyOf(result.rows)
  let seatNote: string | null = null
  if (importer.seats && ready.length) {
    const ent = entitlements(ctx.org, new Date(), await usageOf(ctx), ctx.planConfig)
    seatNote = seatProblem({ seatLimit: ent.seatLimit, seatsUsed: ent.seatsUsed, accountType: ent.accountType }, importer.seats(ready))
  }
  return {
    kind: importer.kind,
    label: importer.label,
    summary: previewSummary(result.rows.length, ready.length),
    total: result.rows.length,
    ready: ready.length,
    ignored: result.ignored,
    rows: result.rows.slice(0, PREVIEW_ROWS).map(({ line, label, errors, warnings }) => ({ line, label, errors, warnings })),
    seatNote,
  }
}

/**
 * Re-checks the file (never trusts the preview), enforces the seat limit
 * through entitlements (assertCapacity), writes the ready rows and records the
 * batch. Rows with errors are left out.
 */
export async function confirmImport(importer: AnyImporter, sheet: Sheet, ctx: Ctx, actor: ImportActor, fileName: string): Promise<{ batchId: Types.ObjectId; imported: number; skipped: number }> {
  const result = await checked(importer, sheet, ctx)
  const ready = readyOf(result.rows)
  if (!ready.length) throw new UserError('No row is ready to import. Fix the rows the preview lists, then upload the file again.')
  if (importer.seats) {
    const need = importer.seats(ready)
    if (need.logins || need.employees) await assertCapacity(ctx, { addLogins: need.logins, addRoles: need.roles, addEmployees: need.employees })
  }
  const committed = await importer.commit(ready, ctx)
  const batchId = await recordBatch(ctx, { kind: importer.kind, label: importer.label, fileName, actor, rows: result.rows.length, result: committed })
  const by = actor.source === 'staff' ? ' by the Flowbit team' : ''
  await audit(ctx, { action: 'import.completed', entity: 'ImportBatch', entityId: batchId, summary: `Imported ${committed.count} ${importer.label.toLowerCase()}${by} from ${fileName}`, meta: { kind: importer.kind, rows: result.rows.length, source: actor.source } })
  return { batchId, imported: committed.count, skipped: result.rows.length - committed.count }
}

const idsOf = (created: Created, model: string) => created.filter((g) => g.model === model).flatMap((g) => g.ids)

/** Locked attendance months and payroll that already uses imported employees block an undo. */
async function undoLockCheck(ctx: Ctx, created: Created, restore: Restore): Promise<string | null> {
  const dayIds = idsOf(created, 'AttendanceDay')
  const correctionIds = idsOf(created, 'AttendanceCorrection')
  const employeeIds = idsOf(created, 'Employee')
  const restoredDates = restore.filter((g) => g.model === 'AttendanceDay' || g.model === 'AttendanceCorrection').flatMap((g) => g.docs.map((d) => String(d.date ?? '')))
  const touchesAttendance = dayIds.length + correctionIds.length + restoredDates.length > 0
  const [days, corrections, lockedMonths, employeesInPayroll] = await Promise.all([
    dayIds.length ? ctx.db(AttendanceDay).find({ _id: { $in: dayIds } }, { date: 1 }).lean() : [],
    correctionIds.length ? ctx.db(AttendanceCorrection).find({ _id: { $in: correctionIds } }, { date: 1 }).lean() : [],
    touchesAttendance ? ctx.db(AttendancePeriod).distinct('period', { status: 'locked' }) : [],
    employeeIds.length ? ctx.db(PayrollEntry).exists({ employeeId: { $in: employeeIds } }) : null,
  ])
  const attendanceDates = [...days.map((d) => String(d.date)), ...corrections.map((c) => String(c.date)), ...restoredDates]
  return undoLockRefusal({ attendanceDates, lockedMonths: new Set(lockedMonths.map(String)), employeesInPayroll: Boolean(employeesInPayroll) })
}

/** Undoes a batch of this workspace within 7 days: removes what it created, puts back what it changed. */
export async function undoImport(ctx: Ctx, batchId: string, by: string): Promise<{ label: string; deleted: number }> {
  const batch = await ctx.db(ImportBatch).findById(batchId).lean()
  if (!batch) throw new NotFoundError('That import')
  const refusal = undoRefusal(batch)
  if (refusal) throw new UserError(refusal)
  const locked = await undoLockCheck(ctx, batch.created as Created, (batch.restore ?? []) as Restore)
  if (locked) throw new UserError(locked)
  // Claim the batch first so two clicks cannot undo it twice.
  const claimed = await ctx.db(ImportBatch).updateOne({ _id: batch._id, status: 'done' }, { $set: { status: 'undone', undoneAt: new Date(), undoneBy: by } })
  if (!claimed.modifiedCount) throw new UserError('This import was already undone.')
  const result = await undoBatch(mongoUndoStore, { orgId: batch.orgId, status: 'done', undoUntil: batch.undoUntil, created: batch.created as never, restore: batch.restore as never })
  await audit(ctx, { action: 'import.undone', entity: 'ImportBatch', entityId: batch._id, summary: `Undid the import of ${batch.imported} ${batch.label.toLowerCase()} (${result.deleted} records removed)`, meta: { kind: batch.kind } })
  return { label: batch.label, deleted: result.deleted }
}
