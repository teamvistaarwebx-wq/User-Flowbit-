'use client'

import { CalendarDays, Flag, FolderKanban, ListChecks, Trash2, UserPlus, X } from 'lucide-react'
import { useState } from 'react'
import { bulkUpdateTasks } from '@/modules/work/tasks/bulk-actions'
import { PRIORITY_LABEL, STATUS_LABEL, TASK_PRIORITIES, TASK_STATUSES } from '@/modules/work/tasks/constants'
import { useAction } from '@/components/ui/action-form'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { DropdownMenu } from '@/components/ui/dropdown-menu'
import { BlockedDialog } from './blocked-dialog'
import { DatePicker } from './date-picker'
import { PeoplePicker } from './people-picker'
import { useTaskData } from './task-data'

/** Appears when list rows are selected: set status, priority, assignees, due date, project, or delete. */
export function BulkBar({ ids, onClear }: { ids: string[]; onClear: () => void }) {
  const data = useTaskData()
  const [run, pending] = useAction(bulkUpdateTasks, { onDone: onClear })
  const [blocking, setBlocking] = useState(false)
  const [assignees, setAssignees] = useState<string[]>([])
  if (!ids.length) return null
  return (
    <div className="sticky bottom-4 z-20 mx-auto flex w-fit max-w-full flex-wrap items-center gap-1.5 rounded-full border border-white/[0.12] bg-menu/95 p-1.5 pl-4 shadow-pop backdrop-blur-xl animate-slide-up">
      <span className="mr-1 text-[13px] font-semibold tabular-nums text-white">{ids.length} selected</span>
      <DropdownMenu
        align="start"
        trigger={<Button variant="ghost" size="sm" icon={<ListChecks className="size-3.5" />} loading={pending}>Status</Button>}
        items={TASK_STATUSES.map((s) => ({ label: STATUS_LABEL[s], onSelect: () => (s === 'blocked' ? setBlocking(true) : void run({ op: 'status', ids, status: s })) }))}
      />
      <DropdownMenu
        align="start"
        trigger={<Button variant="ghost" size="sm" icon={<Flag className="size-3.5" />}>Priority</Button>}
        items={TASK_PRIORITIES.map((p) => ({ label: PRIORITY_LABEL[p], onSelect: () => void run({ op: 'priority', ids, priority: p }) }))}
      />
      <PeoplePicker
        people={data.activePeople}
        value={assignees}
        onChange={(next) => {
          setAssignees(next)
          if (next.length) void run({ op: 'assign', ids, assigneeIds: next })
        }}
        single
        trigger={<Button variant="ghost" size="sm" icon={<UserPlus className="size-3.5" />}>Assign to…</Button>}
      />
      <DatePicker value={null} today={data.today} label="Due date" onChange={(date) => void run({ op: 'due', ids, dueDate: date })} trigger={<Button variant="ghost" size="sm" icon={<CalendarDays className="size-3.5" />}>Due date</Button>} />
      {data.projects.length ? (
        <DropdownMenu
          align="start"
          trigger={<Button variant="ghost" size="sm" icon={<FolderKanban className="size-3.5" />}>Project</Button>}
          items={[{ label: 'No project', onSelect: () => void run({ op: 'project', ids, projectId: null }) }, { type: 'separator' as const }, ...data.projects.map((p) => ({ label: `${p.code} · ${p.name}`, onSelect: () => void run({ op: 'project', ids, projectId: p.id }) }))]}
        />
      ) : null}
      <ConfirmDialog
        trigger={<Button variant="ghost" size="sm" icon={<Trash2 className="size-3.5" />} className="text-[#FF6A66] hover:text-[#FF6A66]">Delete</Button>}
        title={`Delete ${ids.length} task${ids.length === 1 ? '' : 's'}?`}
        description="Subtasks, comments and time entries go with them. Tasks you can't edit are skipped."
        confirmLabel="Delete tasks"
        onConfirm={async () => {
          const res = await bulkUpdateTasks({ op: 'delete', ids })
          if (res.ok) onClear()
          return res
        }}
      />
      <Button variant="ghost" size="sm" onClick={onClear} aria-label="Clear selection" icon={<X className="size-3.5" />} />
      <BlockedDialog
        open={blocking}
        taskTitle={`${ids.length} tasks`}
        pending={pending}
        onCancel={() => setBlocking(false)}
        onConfirm={({ reason }) => {
          setBlocking(false)
          void run({ op: 'status', ids, status: 'blocked', blockedReason: reason })
        }}
      />
    </div>
  )
}
