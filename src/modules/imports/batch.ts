import type { Types } from 'mongoose'
import type { BatchModel, Created, Restore } from './types'

/** Undo of an import batch (console spec 9): within 7 days, only what that batch created. Pure with an injected store. */

export const UNDO_DAYS = 7
const DAY_MS = 86_400_000

export const undoUntilFrom = (createdAt: Date) => new Date(createdAt.getTime() + UNDO_DAYS * DAY_MS)

export type BatchForUndo = { orgId: Types.ObjectId | string; status: 'done' | 'undone' | string; undoUntil: Date | string; created: Created; restore?: Restore }

export function undoRefusal(batch: Pick<BatchForUndo, 'status' | 'undoUntil'>, now: Date = new Date()): string | null {
  if (batch.status === 'undone') return 'This import was already undone.'
  if (new Date(batch.undoUntil).getTime() <= now.getTime()) return `Imports can be undone for ${UNDO_DAYS} days. This one is older.`
  return null
}

/** Storage the undo needs. Every call is limited to the batch's own workspace. */
export type UndoStore = {
  deleteIds: (model: BatchModel, orgId: Types.ObjectId | string, ids: readonly Types.ObjectId[]) => Promise<number>
  replaceDocs: (model: BatchModel, orgId: Types.ObjectId | string, docs: readonly Record<string, unknown>[]) => Promise<number>
}

/**
 * Deletes exactly the documents the batch created (by id, in its own
 * workspace) and puts back the documents it changed. Created ids are removed
 * before restoring, so a restored day is not deleted again.
 */
export async function undoBatch(store: UndoStore, batch: BatchForUndo): Promise<{ deleted: number; restored: number }> {
  let deleted = 0
  let restored = 0
  for (const group of batch.created) if (group.ids.length) deleted += await store.deleteIds(group.model, batch.orgId, group.ids)
  for (const group of batch.restore ?? []) if (group.docs.length) restored += await store.replaceDocs(group.model, batch.orgId, group.docs)
  return { deleted, restored }
}

/** "3 of 5 rows are ready and 2 need fixing." */
export function previewSummary(total: number, ready: number): string {
  if (!total) return 'The file has a header but no rows.'
  const bad = total - ready
  if (!bad) return total === 1 ? 'The row is ready to import.' : `All ${total} rows are ready to import.`
  return `${ready} of ${total} ${total === 1 ? 'row is' : 'rows are'} ready and ${bad} ${bad === 1 ? 'needs' : 'need'} fixing.`
}

/**
 * Why an undo would change locked or paid records, or null (V2-REVIEW T2):
 * attendance in a locked month, or employees that payroll already uses.
 */
export function undoLockRefusal(input: { attendanceDates: readonly string[]; lockedMonths: ReadonlySet<string>; employeesInPayroll: boolean }): string | null {
  const locked = input.attendanceDates.find((d) => input.lockedMonths.has(d.slice(0, 7)))
  if (locked) return `This import touches ${locked.slice(0, 7)}, which is locked. Reopen the month before undoing it.`
  if (input.employeesInPayroll) return 'Payroll already includes people from this import, so it cannot be undone. Remove them by hand instead.'
  return null
}
