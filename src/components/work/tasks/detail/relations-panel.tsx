'use client'

import { Plus, X } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { RELATION_KINDS, RELATION_LABEL, type RelationKind } from '@/modules/work/tasks/relation-flags'
import { addTaskRelation, removeTaskRelation, searchTasksToLink } from '@/modules/work/tasks/relation-actions'
import type { RelatedTask, TaskRelations } from '@/modules/work/tasks/relations'
import type { TaskStatus } from '@/modules/work/tasks/constants'
import { useAction } from '@/components/ui/action-form'
import { Button } from '@/components/ui/button'
import { ChipGroup } from '@/components/ui/chip-group'
import { Input } from '@/components/ui/input'
import { Popover } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { BlockedDialog } from '../blocked-dialog'
import { StatusIcon } from '../task-bits'
import type { TaskRow } from '../types'
import { useTaskPatch } from './use-patch'

const SEARCH_DELAY_MS = 200
const GROUP_KEY: Record<RelationKind, keyof TaskRelations> = { blocked_by: 'blockedBy', blocks: 'blocks', related: 'related' }
const GROUP_TONE: Record<RelationKind, string> = { blocked_by: 'text-orange', blocks: 'text-[#FF6A66]', related: 'text-fg-2' }

/** Search box + results for linking another task. */
function LinkPicker({ taskId, onDone }: { taskId: string; onDone: () => void }) {
  const [kind, setKind] = useState<RelationKind>('blocked_by')
  const [q, setQ] = useState('')
  const [results, setResults] = useState<RelatedTask[]>([])
  const [add, adding] = useAction(addTaskRelation)
  useEffect(() => {
    let live = true
    const timer = setTimeout(() => {
      searchTasksToLink({ id: taskId, q })
        .then((res) => live && setResults(res.ok ? (res.data ?? []) : []))
        .catch((error: unknown) => console.error('[tasks] link search failed', error))
    }, SEARCH_DELAY_MS)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [taskId, q])
  const pick = async (other: RelatedTask) => {
    const res = await add({ id: taskId, otherId: other.id, kind })
    if (res.ok) onDone()
  }
  return (
    <div className="w-[min(340px,80vw)] space-y-3">
      <ChipGroup size="sm" value={kind} onValueChange={(v) => setKind(v as RelationKind)} options={RELATION_KINDS.map((k) => ({ value: k, label: RELATION_LABEL[k] }))} />
      <Input inputSize="sm" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by key or title" aria-label="Search tasks to link" />
      <ul className="max-h-64 space-y-0.5 overflow-y-auto" aria-busy={adding}>
        {results.length === 0 ? <li className="px-2 py-3 text-center text-[13px] text-fg-2">No tasks found</li> : null}
        {results.map((t) => (
          <li key={t.id}>
            <button type="button" disabled={adding} onClick={() => void pick(t)} className="flex min-h-9 w-full items-center gap-2 rounded-lg px-2 text-left text-[13px] text-white transition-colors hover:bg-white/[0.06] disabled:opacity-60">
              <StatusIcon status={t.status as TaskStatus} />
              <span className="shrink-0 tabular-nums text-[#979797]">{t.key}</span>
              <span className="min-w-0 truncate">{t.title}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Blocked by / Blocks / Related, with add and remove; ties into the Blocked status (with its reason). */
export function RelationsPanel({ task, relations }: { task: TaskRow; relations: TaskRelations }) {
  const [open, setOpen] = useState(false)
  const [blocking, setBlocking] = useState(false)
  const [remove] = useAction(removeTaskRelation)
  const [patch, pending] = useTaskPatch(task.id)
  const openBlockers = relations.blockedBy.filter((t) => t.status !== 'done')
  const total = relations.blockedBy.length + relations.blocks.length + relations.related.length

  return (
    <div className="space-y-3">
      {task.status === 'blocked' && relations.blockedBy.length && !openBlockers.length ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[#08AD93]/[0.14] px-3 py-2 text-[13px] text-[#2DCBAF]">
          Every task this was waiting on is done.
          {task.canEdit ? <Button size="sm" variant="secondary" loading={pending} onClick={() => void patch({ status: 'in_progress' })}>Unblock</Button> : null}
        </div>
      ) : null}
      {task.status !== 'blocked' && task.status !== 'done' && openBlockers.length ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[#E68763]/[0.14] px-3 py-2 text-[13px] text-orange">
          Waiting on {openBlockers.map((t) => t.key).join(', ')}.
          {task.canEdit ? <Button size="sm" variant="ghost" onClick={() => setBlocking(true)}>Mark blocked</Button> : null}
        </div>
      ) : null}
      {total === 0 ? <p className="text-[13px] text-fg-2">Link tasks this one waits on, holds up or relates to.</p> : null}
      {RELATION_KINDS.map((kind) => {
        const rows = relations[GROUP_KEY[kind]]
        if (!rows.length) return null
        return (
          <section key={kind} aria-label={RELATION_LABEL[kind]}>
            <h3 className={cn('mb-1 text-xs font-semibold uppercase tracking-[0.06em]', GROUP_TONE[kind])}>{RELATION_LABEL[kind]}</h3>
            <ul className="space-y-0.5">
              {rows.map((t) => (
                <li key={t.id} className="group flex min-h-9 items-center gap-2.5 rounded-lg px-2 transition-colors hover:bg-white/[0.04]">
                  <StatusIcon status={t.status as TaskStatus} />
                  <span className="shrink-0 text-xs tabular-nums text-[#979797]">{t.key}</span>
                  <Link href={`/app/work/tasks/${t.id}`} className={cn('min-w-0 flex-1 truncate text-sm text-white transition-colors hover:text-blush', t.status === 'done' && 'text-fg-2 line-through decoration-white/30')}>{t.title}</Link>
                  {task.canEdit ? (
                    <button type="button" aria-label={`Remove link to ${t.key}`} onClick={() => void remove({ id: task.id, otherId: t.id, kind })} className="press inline-flex size-6 items-center justify-center rounded-full text-fg-3 opacity-60 transition hover:bg-white/10 hover:text-white group-hover:opacity-100 focus-visible:opacity-100 touch:opacity-100">
                      <X className="size-3.5" />
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        )
      })}
      {task.canEdit ? (
        <Popover open={open} onOpenChange={setOpen} trigger={<Button size="sm" variant="ghost" icon={<Plus className="size-3.5" />}>Link a task</Button>}>
          {open ? <LinkPicker taskId={task.id} onDone={() => setOpen(false)} /> : null}
        </Popover>
      ) : null}
      <BlockedDialog
        open={blocking}
        taskTitle={task.title}
        pending={pending}
        onCancel={() => setBlocking(false)}
        onConfirm={({ reason, mentionIds }) => {
          setBlocking(false)
          void patch({ status: 'blocked', blockedReason: reason, blockedMentionIds: mentionIds })
        }}
      />
    </div>
  )
}

