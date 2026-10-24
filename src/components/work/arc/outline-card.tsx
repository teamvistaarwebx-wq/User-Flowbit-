'use client'

import { useState } from 'react'
import { Check, Plus, Trash2, X } from 'lucide-react'
import { Button, IconButton } from '@/components/ui/button'
import { DateInput, Input } from '@/components/ui/input'
import { useAction } from '@/components/ui/action-form'
import { addDays, formatDate } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { discardRun } from '@/modules/work/arc/actions'
import { applyOutline } from '@/modules/work/arc/apply-actions'
import type { OutlineDraft } from '@/modules/work/arc/schemas'
import { DraftFooter } from './draft-footer'

type Priority = 'low' | 'medium' | 'high' | 'urgent'
type TaskRow = { key: string; title: string; estimateMinutes: number; priority: Priority }
type MilestoneRow = { key: string; title: string; dueDate: string; tasks: TaskRow[] }

const PRIORITIES: Priority[] = ['low', 'medium', 'high', 'urgent']
let seq = 0
const nextKey = () => `k${(seq += 1)}`

function fromDraft(draft: OutlineDraft, startDate: string): MilestoneRow[] {
  return draft.milestones.map((m) => ({ key: nextKey(), title: m.title, dueDate: addDays(startDate, m.dueOffsetDays), tasks: m.tasks.map((t) => ({ key: nextKey(), title: t.title, estimateMinutes: t.estimateMinutes, priority: t.priority })) }))
}

type Props = { runId: string; status: string; projectName: string; projectId?: string; startDate: string; draft: OutlineDraft; appliedHref?: string }

/** Editable outline preview: rename, delete rows, change dates; Apply creates everything in one go. */
export function OutlineCard({ runId, status, projectName, projectId, startDate, draft, appliedHref }: Props) {
  const [name, setName] = useState(projectName)
  const [start, setStart] = useState(startDate)
  const [rows, setRows] = useState<MilestoneRow[]>(() => fromDraft(draft, startDate))
  const [apply, applying] = useAction(applyOutline)
  const [discard, discarding] = useAction(discardRun)
  const editable = status === 'draft'
  const taskCount = rows.reduce((s, m) => s + m.tasks.length, 0)

  const setMilestone = (key: string, patch: Partial<MilestoneRow>) => setRows((prev) => prev.map((m) => (m.key === key ? { ...m, ...patch } : m)))
  const setTask = (mKey: string, tKey: string, patch: Partial<TaskRow>) => setRows((prev) => prev.map((m) => (m.key !== mKey ? m : { ...m, tasks: m.tasks.map((t) => (t.key === tKey ? { ...t, ...patch } : t)) })))
  const removeTask = (mKey: string, tKey: string) => setRows((prev) => prev.map((m) => (m.key !== mKey ? m : { ...m, tasks: m.tasks.filter((t) => t.key !== tKey) })))
  const addTask = (mKey: string) => setRows((prev) => prev.map((m) => (m.key !== mKey ? m : { ...m, tasks: [...m.tasks, { key: nextKey(), title: 'New task', estimateMinutes: 60, priority: 'medium' }] })))
  const shiftStart = (next: string) => {
    if (!next) return
    const delta = Math.round((Date.parse(next) - Date.parse(start)) / 86_400_000)
    setStart(next)
    setRows((prev) => prev.map((m) => ({ ...m, dueDate: addDays(m.dueDate, delta) })))
  }

  const onApply = () =>
    apply({
      runId,
      projectId,
      projectName: projectId ? undefined : name,
      startDate: start,
      milestones: rows.map((m) => ({ title: m.title, dueDate: m.dueDate, tasks: m.tasks.filter((t) => t.title.trim()).map((t) => ({ title: t.title, estimateMinutes: t.estimateMinutes, priority: t.priority })) })),
    })

  return (
    <div className={cn('space-y-4', !editable && 'opacity-80')}>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px]">
        <label className="space-y-1">
          <span className="text-[13px] font-medium text-white">{projectId ? 'Existing project' : 'New project'}</span>
          <Input value={name} onChange={(e) => setName(e.target.value)} disabled={!editable || Boolean(projectId)} maxLength={100} />
        </label>
        <label className="space-y-1">
          <span className="text-[13px] font-medium text-white">Start date</span>
          <DateInput value={start} onChange={(e) => shiftStart(e.target.value)} disabled={!editable} />
        </label>
      </div>
      <ol className="space-y-3">
        {rows.map((m, i) => (
          <li key={m.key} className="rounded-[10px] bg-control/70 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-chip-active text-xs font-semibold tabular-nums text-white">{i + 1}</span>
              <Input value={m.title} onChange={(e) => setMilestone(m.key, { title: e.target.value })} disabled={!editable} inputSize="sm" className="min-w-0 flex-1 font-semibold" aria-label="Milestone title" />
              <DateInput value={m.dueDate} onChange={(e) => e.target.value && setMilestone(m.key, { dueDate: e.target.value })} disabled={!editable} inputSize="sm" className="w-40" aria-label="Milestone due date" />
              {editable && rows.length > 1 ? <IconButton label="Remove milestone" size="sm" onClick={() => setRows((prev) => prev.filter((x) => x.key !== m.key))}><Trash2 className="size-4" /></IconButton> : null}
            </div>
            <ul className="mt-2 space-y-1.5 pl-8">
              {m.tasks.map((t) => (
                <li key={t.key} className="flex flex-wrap items-center gap-2">
                  <Input value={t.title} onChange={(e) => setTask(m.key, t.key, { title: e.target.value })} disabled={!editable} inputSize="sm" className="min-w-0 flex-1" aria-label="Task title" />
                  <Input type="number" min={0} step={15} value={t.estimateMinutes} onChange={(e) => setTask(m.key, t.key, { estimateMinutes: Math.max(0, Number(e.target.value) || 0) })} disabled={!editable} inputSize="sm" className="w-20" aria-label="Estimate in minutes" title="Estimate (minutes)" />
                  <select value={t.priority} onChange={(e) => setTask(m.key, t.key, { priority: e.target.value as Priority })} disabled={!editable} aria-label="Priority" className="h-8 rounded-full border border-white/[0.18] bg-white/[0.06] px-3 text-xs text-white transition-colors hover:border-white/[0.28] focus:border-white/45 focus:outline-none">
                    {PRIORITIES.map((p) => <option key={p} value={p} className="bg-menu">{p[0].toUpperCase() + p.slice(1)}</option>)}
                  </select>
                  {editable ? <IconButton label="Remove task" size="sm" onClick={() => removeTask(m.key, t.key)}><X className="size-4" /></IconButton> : null}
                </li>
              ))}
              {editable ? (
                <li>
                  <button type="button" onClick={() => addTask(m.key)} className="inline-flex items-center gap-1 text-[13px] text-link transition-opacity hover:opacity-80"><Plus className="size-3.5" /> Add task</button>
                </li>
              ) : null}
            </ul>
          </li>
        ))}
      </ol>
      <DraftFooter
        status={status}
        summary={`${rows.length} milestones · ${taskCount} tasks · ends ${formatDate(rows.map((m) => m.dueDate).sort().at(-1) ?? start)}`}
        appliedHref={appliedHref}
        appliedLabel="Open project"
        actions={
          <>
            <Button variant="ghost" loading={discarding} onClick={() => discard({ id: runId })}>Discard</Button>
            <Button variant="primary" icon={<Check className="size-4" />} loading={applying} disabled={!taskCount || (!projectId && !name.trim())} onClick={onApply}>Apply</Button>
          </>
        }
      />
    </div>
  )
}
