'use client'

import { useState } from 'react'
import { Check, Plus, X } from 'lucide-react'
import { Button, IconButton } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAction } from '@/components/ui/action-form'
import { formatDuration } from '@/lib/dates'
import { discardRun } from '@/modules/work/arc/actions'
import { applyBreakdown } from '@/modules/work/arc/apply-actions'
import type { BreakdownDraft } from '@/modules/work/arc/schemas'
import { DraftFooter } from './draft-footer'

type Row = { key: string; title: string; estimateMinutes: number }
let seq = 0
const nextKey = () => `b${(seq += 1)}`

/** Suggested subtasks; edit, drop or add rows, then Apply creates them under the task. */
export function BreakdownCard({ runId, status, draft, appliedHref }: { runId: string; status: string; draft: BreakdownDraft; appliedHref?: string }) {
  const [rows, setRows] = useState<Row[]>(() => draft.subtasks.map((s) => ({ key: nextKey(), ...s })))
  const [apply, applying] = useAction(applyBreakdown)
  const [discard, discarding] = useAction(discardRun)
  const editable = status === 'draft'
  const set = (key: string, patch: Partial<Row>) => setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  const live = rows.filter((r) => r.title.trim())
  return (
    <div className="space-y-3">
      <ol className="space-y-1.5">
        {rows.map((r, i) => (
          <li key={r.key} className="flex items-center gap-2">
            <span className="w-5 text-right text-xs tabular-nums text-[#979797]">{i + 1}.</span>
            <Input value={r.title} onChange={(e) => set(r.key, { title: e.target.value })} disabled={!editable} inputSize="sm" className="min-w-0 flex-1" aria-label="Subtask" />
            <Input type="number" min={0} step={15} value={r.estimateMinutes} onChange={(e) => set(r.key, { estimateMinutes: Math.max(0, Number(e.target.value) || 0) })} disabled={!editable} inputSize="sm" className="w-20" aria-label="Estimate in minutes" title="Estimate (minutes)" />
            {editable ? <IconButton label="Remove subtask" size="sm" onClick={() => setRows((prev) => prev.filter((x) => x.key !== r.key))}><X className="size-4" /></IconButton> : null}
          </li>
        ))}
      </ol>
      {editable ? (
        <button type="button" onClick={() => setRows((prev) => [...prev, { key: nextKey(), title: '', estimateMinutes: 60 }])} className="inline-flex items-center gap-1 pl-7 text-[13px] text-link transition-opacity hover:opacity-80">
          <Plus className="size-3.5" /> Add subtask
        </button>
      ) : null}
      <DraftFooter
        status={status}
        summary={`${live.length} subtasks · ${formatDuration(live.reduce((s, r) => s + r.estimateMinutes, 0))} estimated`}
        appliedHref={appliedHref}
        appliedLabel="Open task"
        actions={
          <>
            <Button variant="ghost" loading={discarding} onClick={() => discard({ id: runId })}>Discard</Button>
            <Button variant="primary" icon={<Check className="size-4" />} loading={applying} disabled={!live.length} onClick={() => apply({ runId, subtasks: live.map((r) => ({ title: r.title, estimateMinutes: r.estimateMinutes })) })}>Apply</Button>
          </>
        }
      />
    </div>
  )
}
