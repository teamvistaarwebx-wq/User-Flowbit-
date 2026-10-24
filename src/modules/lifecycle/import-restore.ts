/**
 * ImportBatch.restore holds full copies of documents an import changed, kept only so the
 * import can be undone. Once the undo window has passed they serve nothing, so the daily
 * lifecycle cron clears them (pure; R3 L-30c).
 */

/** Batches past their undo window that still hold restore copies. */
export const expiredRestoreFilter = (now: Date) => ({ undoUntil: { $lte: now }, 'restore.0': { $exists: true } })

export const CLEAR_RESTORE: { $set: { restore: unknown[] } } = { $set: { restore: [] } }

/** True when the batch can no longer be undone, so its restore copies may go (matches undoRefusal's window). */
export const isRestoreExpired = (batch: { undoUntil: Date | string }, now: Date): boolean => new Date(batch.undoUntil).getTime() <= now.getTime()
