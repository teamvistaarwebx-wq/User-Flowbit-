'use client'

import { History, Undo2 } from 'lucide-react'
import type { ActionResult } from '@/lib/action-types'
import { useAction } from '@/components/ui/action-form'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { TableCard } from '@/components/settings/surface'
import type { ImportHistoryRow } from '@/modules/imports/types'


/** Import history with Undo (7 days). Staff imports read "Imported by the Flowbit team". */
export function ImportHistory({ rows, undo, hidden = {} }: { rows: ImportHistoryRow[]; undo: (input: FormData) => Promise<ActionResult<unknown>>; hidden?: Record<string, string> }) {
  const [run, pending] = useAction(undo)
  const undoRow = (batchId: string) => {
    const form = new FormData()
    for (const [k, v] of Object.entries({ ...hidden, batchId })) form.set(k, v)
    return run(form)
  }
  return (
    <TableCard icon={<History strokeWidth={1.5} />} label="Import history" description="Each import can be undone for 7 days">
      {rows.length ? (
        <ul className="border-t border-line py-1.5">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 px-[23px] py-2.5 text-sm">
              <span className="min-w-0 flex-1">
                <span className="block text-white">{r.label}: {r.imported} imported{r.skipped ? `, ${r.skipped} left out` : ''}{r.status === 'undone' ? ' · undone' : ''}</span>
                <span className="block text-xs text-[#979797]">{r.flowbit ? `Imported by the Flowbit team (${r.by})` : r.by} · {r.fileName} · {new Date(r.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })}</span>
              </span>
              {r.canUndo ? (
                <Button size="sm" variant="ghost" icon={<Undo2 className="size-3.5" />} loading={pending} onClick={() => undoRow(r.id)}>Undo</Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <div className="border-t border-line"><EmptyState compact icon={<History />} title="No imports yet" /></div>
      )}
    </TableCard>
  )
}
