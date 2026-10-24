'use client'

import Link from 'next/link'
import { updateTask } from '@/modules/work/tasks/actions'
import { cn } from '@/lib/utils'
import { useAction } from '@/components/ui/action-form'
import { AvatarStack } from '@/components/ui/avatar'
import { StatusPill } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Progress } from '@/components/ui/progress'
import { QuickAdd } from '../quick-add'
import { DueText } from '../task-bits'
import { useTaskData } from '../task-data'
import type { TaskRow } from '../types'

/** Child tasks with their own status, people and dates; one level deep. */
export function SubtasksPanel({ parentId, subtasks, canAdd }: { parentId: string; subtasks: TaskRow[]; canAdd: boolean }) {
  const data = useTaskData()
  const [run] = useAction(updateTask)
  const done = subtasks.filter((s) => s.status === 'done').length
  return (
    <div className="space-y-3">
      {subtasks.length ? <Progress value={(done / subtasks.length) * 100} label={`${done} of ${subtasks.length} done`} /> : <p className="text-[13px] text-fg-2">Break this task into subtasks.</p>}
      <ul className="space-y-1">
        {subtasks.map((s) => (
          <li key={s.id} className="flex min-h-9 items-center gap-2.5 rounded-lg px-2 transition-colors hover:bg-white/[0.04]">
            <Checkbox aria-label={`Mark ${s.title} done`} disabled={!s.canEdit} checked={s.status === 'done'} onCheckedChange={(on) => void run({ id: s.id, status: on ? 'done' : 'todo' })} />
            <Link href={`/app/work/tasks/${s.id}`} className={cn('min-w-0 flex-1 truncate text-sm text-white transition-colors hover:text-blush', s.status === 'done' && 'text-fg-2 line-through decoration-white/30')}>
              {s.title}
            </Link>
            <StatusPill status={s.status} className="hidden sm:inline-flex" />
            <DueText dueDate={s.dueDate} today={data.today} done={s.status === 'done'} />
            <AvatarStack size="xs" max={2} people={s.assigneeIds.map(data.avatar)} />
          </li>
        ))}
      </ul>
      {canAdd ? <QuickAdd context={{ parentId }} placeholder="Add a subtask and press Enter" /> : null}
    </div>
  )
}
