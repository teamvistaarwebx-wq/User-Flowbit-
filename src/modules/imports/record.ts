import 'server-only'
import type { Types } from 'mongoose'
import type { Ctx } from '@/lib/ctx'
import { ImportBatch } from '@/models/imports/ImportBatch'
import { undoUntilFrom } from './batch'
import type { CommitResult, ImportActor, ImportKind } from './types'

/** Stores the batch of a confirmed import so it shows in the history and can be undone for 7 days. */
export async function recordBatch(ctx: Pick<Ctx, 'db'>, input: { kind: ImportKind; label: string; fileName: string; actor: ImportActor; rows: number; result: CommitResult }): Promise<Types.ObjectId> {
  const now = new Date()
  const { actor } = input
  const batch = await ctx.db(ImportBatch).create({
    kind: input.kind,
    label: input.label,
    fileName: input.fileName.slice(0, 200),
    source: actor.source,
    actorUserId: actor.source === 'self' ? actor.userId : undefined,
    staffId: actor.source === 'staff' ? actor.staffId : undefined,
    actorName: actor.name,
    rows: input.rows,
    imported: input.result.count,
    skipped: Math.max(0, input.rows - input.result.count),
    created: input.result.created.filter((c) => c.ids.length),
    restore: (input.result.restore ?? []).filter((r) => r.docs.length),
    undoUntil: undoUntilFrom(now),
  })
  return batch._id
}
