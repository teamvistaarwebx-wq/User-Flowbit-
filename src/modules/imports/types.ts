import type { Types } from 'mongoose'
import type { Permission, ProductKey } from '@/lib/catalog'
import type { Ctx } from '@/lib/ctx'
import type { Sheet } from './sheet'

/** The importer framework (console spec 9): template → upload → preview with row errors → confirm → batch (undo 7 days) → history. */

export const IMPORT_KINDS = ['team', 'employees', 'attendance', 'projects', 'tasks', 'leads', 'contacts', 'folio_clients', 'folio_items'] as const
export type ImportKind = (typeof IMPORT_KINDS)[number]
export const isImportKind = (value: unknown): value is ImportKind => typeof value === 'string' && (IMPORT_KINDS as readonly string[]).includes(value)

/** Collections an import may create in, and so an undo may delete from (modules/imports/batch-store). */
export const BATCH_MODELS = ['Invite', 'Member', 'Employee', 'AttendanceCorrection', 'AttendanceDay', 'Project', 'Task', 'Lead', 'StageEvent', 'Client', 'FolioServiceItem', 'TaskComment', 'Activity', 'Deal', 'Invoice', 'Quote'] as const
export type BatchModel = (typeof BATCH_MODELS)[number]

export type Column = { key: string; required?: boolean; example: string; help?: string }

export type CheckedRow<R> = { line: number; label: string; errors: string[]; warnings: string[]; record: R | null }
export type CheckResult<R> = { rows: CheckedRow<R>[]; ignored: string[] } | { error: string }

/** Seats an import would add (checked against the plan through entitlements / assertCapacity). */
export type SeatNeed = { logins?: number; roles?: string[]; employees?: number }

export type Created = { model: BatchModel; ids: Types.ObjectId[] }[]
/** Documents as they were before the import changed them (restored on undo). */
export type Restore = { model: BatchModel; docs: Record<string, unknown>[] }[]
export type CommitResult = { created: Created; restore?: Restore; count: number }

export type Importer<R = unknown> = {
  kind: ImportKind
  label: string
  description: string
  /** Product that must be on; null for workspace-wide (team). */
  product: ProductKey | null
  /** Permission a workspace member needs for the self-serve path. */
  perm: Permission
  columns: readonly Column[]
  maxRows: number
  check: (sheet: Sheet, ctx: Ctx) => Promise<CheckResult<R>>
  seats?: (records: readonly R[]) => SeatNeed
  commit: (records: readonly R[], ctx: Ctx) => Promise<CommitResult>
}

/** Who confirmed an import: someone in the workspace, or the Flowbit team from the Console. */
export type ImportActor = { source: 'self'; userId: Types.ObjectId; name: string } | { source: 'staff'; staffId: Types.ObjectId; name: string }

export type PreviewRow = { line: number; label: string; errors: string[]; warnings: string[] }
export type ImportPreview = { kind: ImportKind; label: string; summary: string; total: number; ready: number; ignored: string[]; rows: PreviewRow[]; seatNote: string | null }

export type ImportHistoryRow = { id: string; label: string; fileName: string; imported: number; skipped: number; by: string; flowbit: boolean; at: string; status: 'done' | 'undone'; undoUntil: string; canUndo: boolean }
