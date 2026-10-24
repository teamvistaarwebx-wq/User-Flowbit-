'use client'

import Link from 'next/link'
import { ListPlus, Plus, SquareCheckBig, Trash2 } from 'lucide-react'
import { ActionForm, SubmitButton, useAction } from '@/components/ui/action-form'
import { StatusPill } from '@/components/ui/badge'
import { Button, IconButton } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { DateInput, Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { formatDate } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { addActionItem, createTasksFromItems, removeActionItem, toggleActionItem } from '@/modules/work/meetings/item-actions'
import type { PickPerson } from '../teams/people-picker'

export type ActionItemRow = { id: string; title: string; assignee?: string; dueDate?: string; done: boolean; task?: { id: string; key: string; status: string } }

function ItemRow({ meetingId, item, editable, canCreateTasks }: { meetingId: string; item: ActionItemRow; editable: boolean; canCreateTasks: boolean }) {
  const [toggle] = useAction(toggleActionItem)
  const [remove, removing] = useAction(removeActionItem)
  const [makeTask, making] = useAction(createTasksFromItems)
  return (
    <li className="flex min-h-12 flex-wrap items-center gap-3 rounded-[10px] px-2 py-1.5 transition-colors hover:bg-white/[0.04]">
      <Checkbox checked={item.done} disabled={!editable} onCheckedChange={(done) => toggle({ id: meetingId, itemId: item.id, done })} aria-label={`Mark '${item.title}' done`} />
      <div className="min-w-0 flex-1 basis-[180px]">
        <p className={cn('truncate text-sm text-white', item.done && 'text-fg-2 line-through decoration-white/30')}>{item.title}</p>
        <p className="text-[13px] text-[#959596]">{[item.assignee, item.dueDate ? `due ${formatDate(item.dueDate)}` : undefined].filter(Boolean).join(' · ') || 'Unassigned'}</p>
      </div>
      {item.task ? (
        <Link href={`/app/work/tasks/${item.task.id}`} className="inline-flex items-center gap-2 text-[13px] font-medium text-link transition-opacity hover:opacity-80">
          {item.task.key} <StatusPill status={item.task.status} />
        </Link>
      ) : canCreateTasks && editable ? (
        <Button size="sm" variant="outline" icon={<SquareCheckBig className="size-4" />} loading={making} onClick={() => makeTask({ id: meetingId, itemId: item.id })}>
          Create task
        </Button>
      ) : null}
      {editable ? (
        <IconButton label="Remove item" size="sm" loading={removing} onClick={() => remove({ id: meetingId, itemId: item.id })}>
          <Trash2 className="size-4" />
        </IconButton>
      ) : null}
    </li>
  )
}

/** Action items with "Create task" per item and in bulk. */
export function ActionItems({ meetingId, items, people, editable, canCreateTasks }: { meetingId: string; items: ActionItemRow[]; people: PickPerson[]; editable: boolean; canCreateTasks: boolean }) {
  const [createAll, creating] = useAction(createTasksFromItems)
  const pendingTasks = items.filter((i) => !i.task).length
  return (
    <div className="space-y-3">
      {items.length ? (
        <ul className="-mx-2">
          {items.map((i) => <ItemRow key={i.id} meetingId={meetingId} item={i} editable={editable} canCreateTasks={canCreateTasks} />)}
        </ul>
      ) : (
        <p className="py-3 text-[13px] text-fg-2">No action items yet. Add what people agreed to do.</p>
      )}
      {editable ? (
        <ActionForm action={addActionItem} resetOnSuccess className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_180px_150px_auto]">
          <input type="hidden" name="id" value={meetingId} />
          <Input name="title" placeholder="Add an action item" maxLength={200} aria-label="Action item" />
          <Select name="assigneeId" options={people.map((p) => ({ value: p.id, label: p.name }))} placeholder="Assignee" aria-label="Assignee" />
          <DateInput name="dueDate" aria-label="Due date" />
          <SubmitButton icon={<Plus className="size-4" />} pendingLabel="Adding…" variant="secondary">Add</SubmitButton>
        </ActionForm>
      ) : null}
      {editable && canCreateTasks && pendingTasks > 1 ? (
        <Button variant="primary" size="sm" icon={<ListPlus className="size-4" />} loading={creating} onClick={() => createAll({ id: meetingId })}>
          Create all {pendingTasks} tasks
        </Button>
      ) : null}
    </div>
  )
}
