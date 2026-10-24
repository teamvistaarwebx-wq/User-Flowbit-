import 'server-only'
import type { Scoped } from '@/lib/db/scoped'
import { ImportBatch } from '@/models/imports/ImportBatch'
import { undoRefusal } from './batch'
import type { ImportHistoryRow } from './types'

/** The latest imports of a workspace for the history list. `canUndo` adds the caller's rule (self-serve: the kind's permission; staff: their own batches) to the 7-day window. */
export async function importHistory(db: <M extends typeof ImportBatch>(model: M) => Scoped<M>, canUndo: (row: { kind: string; source: string }) => boolean): Promise<ImportHistoryRow[]> {
  const rows = await db(ImportBatch).find({ kind: { $ne: 'mcp' } }).sort({ createdAt: -1 }).limit(50).lean()
  const now = new Date()
  return rows.map((b) => ({
    id: String(b._id),
    label: b.label,
    fileName: b.fileName ?? '',
    imported: b.imported ?? 0,
    skipped: b.skipped ?? 0,
    by: b.actorName,
    flowbit: b.source === 'staff',
    at: b.createdAt.toISOString(),
    status: b.status === 'undone' ? 'undone' : 'done',
    undoUntil: new Date(b.undoUntil).toISOString(),
    canUndo: b.status === 'done' && !undoRefusal(b, now) && canUndo({ kind: b.kind, source: b.source }),
  }))
}
