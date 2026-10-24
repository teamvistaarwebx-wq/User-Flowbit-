'use client'

import { Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { addChecklistItem, deleteChecklistItem, renameChecklistItem, toggleChecklistItem } from '@/modules/work/tasks/checklist-actions'
import { cn } from '@/lib/utils'
import { useAction } from '@/components/ui/action-form'
import { Checkbox } from '@/components/ui/checkbox'
import { IconButton } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'

export type ChecklistItem = { id: string; title: string; done: boolean }

function ItemRow({ taskId, item, canEdit }: { taskId: string; item: ChecklistItem; canEdit: boolean }) {
  const [toggle] = useAction(toggleChecklistItem)
  const [rename] = useAction(renameChecklistItem)
  const [title, setTitle] = useState(item.title)
  return (
    <li className="group flex min-h-8 items-center gap-2.5 rounded-lg px-2 transition-colors hover:bg-white/[0.04]">
      <Checkbox aria-label={`Check ${item.title}`} disabled={!canEdit} checked={item.done} onCheckedChange={(done) => void toggle({ taskId, itemId: item.id, done })} />
      {canEdit ? (
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title.trim() && title.trim() !== item.title && void rename({ taskId, itemId: item.id, title: title.trim() })}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          aria-label="Checklist item"
          className={cn('h-8 min-w-0 flex-1 bg-transparent text-sm text-fg focus:outline-none', item.done && 'text-fg-2 line-through decoration-white/30')}
        />
      ) : (
        <span className={cn('flex-1 text-sm text-white', item.done && 'text-fg-2 line-through decoration-white/30')}>{item.title}</span>
      )}
      {canEdit ? (
        <ConfirmDialog
          trigger={<IconButton label={`Remove ${item.title}`} size="sm" className="opacity-0 group-hover:opacity-100 touch:opacity-100 focus:opacity-100"><Trash2 className="size-3.5" /></IconButton>}
          title={`Remove "${item.title}"?`}
          confirmLabel="Remove"
          onConfirm={() => deleteChecklistItem({ taskId, itemId: item.id })}
        />
      ) : null}
    </li>
  )
}

/** Lightweight checklist on the task (separate from real subtasks). */
export function ChecklistPanel({ taskId, items, canEdit }: { taskId: string; items: ChecklistItem[]; canEdit: boolean }) {
  const [add, pending] = useAction(addChecklistItem)
  const [title, setTitle] = useState('')
  const done = items.filter((i) => i.done).length
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim() || pending) return
    const res = await add({ taskId, title: title.trim() })
    if (res.ok) setTitle('')
  }
  return (
    <div className="space-y-3">
      {items.length ? <Progress value={(done / items.length) * 100} label={`${done} of ${items.length} checked`} /> : <p className="text-[13px] text-fg-2">No checklist yet.</p>}
      <ul className="space-y-0.5">
        {items.map((i) => <ItemRow key={i.id} taskId={taskId} item={i} canEdit={canEdit} />)}
      </ul>
      {canEdit ? (
        <form onSubmit={submit}>
          <Input inputSize="sm" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add an item and press Enter" readOnly={pending} aria-busy={pending} maxLength={200} aria-label="New checklist item" />
        </form>
      ) : null}
    </div>
  )
}
