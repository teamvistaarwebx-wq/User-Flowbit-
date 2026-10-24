import type { Created, Restore, BatchModel } from '@/modules/imports/types'

/** One change done through MCP: the record, its link, and what an undo removes or puts back. */
export type ExecResult = Readonly<{
  model: BatchModel
  id: string
  label: string
  link: string
  action: 'created' | 'updated'
  created: Created
  restore: Restore
}>

/** Merges per-change undo data into the batch's lists (one group per model). */
export function mergeUndo(results: readonly ExecResult[]): { created: Created; restore: Restore } {
  const created = new Map<BatchModel, Created[number]['ids']>()
  const restore = new Map<BatchModel, Restore[number]['docs']>()
  for (const r of results) {
    for (const g of r.created) created.set(g.model, [...(created.get(g.model) ?? []), ...g.ids])
    for (const g of r.restore) {
      // Keep the oldest copy of a document changed twice in one batch, so undo returns to the start.
      const docs = restore.get(g.model) ?? []
      const fresh = g.docs.filter((d) => !docs.some((x) => String(x._id) === String(d._id)))
      restore.set(g.model, [...docs, ...fresh])
    }
  }
  return {
    created: [...created].map(([model, ids]) => ({ model, ids })),
    restore: [...restore].map(([model, docs]) => ({ model, docs })),
  }
}
