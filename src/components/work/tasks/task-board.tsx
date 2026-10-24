'use client'

import { Lock } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { moveTaskOnBoard } from '@/modules/work/tasks/actions'
import { STATUS_LABEL, type TaskStatus } from '@/modules/work/tasks/constants'
import { statusTone } from '@/lib/status'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { AvatarStack } from '@/components/ui/avatar'
import { PriorityLabel } from '@/components/ui/badge'
import { Kanban, KanbanCard, noDrag } from '@/components/ui/kanban'
import { BlockedDialog, type BlockedReason } from './blocked-dialog'
import { QuickAdd, type QuickAddContext } from './quick-add'
import { CountChip, DueText, ProjectChip, RelationFlagMarks } from './task-bits'
import { useTaskData } from './task-data'
import { TaskRowMenu } from './task-row-menu'
import type { TaskRow } from './types'
import { TaskClientLogo } from './client-logo'
import { TaskOrder } from './panel/task-order'

type Item = TaskRow & { columnId: TaskStatus }
type PendingBlock = { task: TaskRow; resolve: (reason: BlockedReason | null) => void }

export type TaskBoardProps = {
  rows: TaskRow[]
  statuses: TaskStatus[]
  totals: Record<TaskStatus, number>
  quickAdd?: QuickAddContext
}

/** Board view: drag cards between statuses (Blocked asks why first), quick add per column. */
export function TaskBoard({ rows, statuses, totals, quickAdd }: TaskBoardProps) {
  const router = useRouter()
  const data = useTaskData()
  const [block, setBlock] = useState<PendingBlock | null>(null)
  const items = useMemo<Item[]>(() => rows.map((r) => ({ ...r, columnId: r.status })), [rows])
  const columns = statuses.map((s) => {
    const shown = items.filter((i) => i.columnId === s).length
    return { id: s, title: STATUS_LABEL[s], tone: statusTone(s), meta: totals[s] > shown ? `${shown} of ${totals[s]}` : undefined }
  })

  const askReason = (task: TaskRow) => new Promise<BlockedReason | null>((resolve) => setBlock({ task, resolve }))

  const onMove = async (id: string, to: string, toIndex: number) => {
    const task = items.find((i) => i.id === id)
    if (!task) return false
    const status = to as TaskStatus
    let reason: BlockedReason | null = null
    if (status === 'blocked' && task.status !== 'blocked') {
      reason = await askReason(task)
      if (!reason) return false
    }
    const column = items.filter((i) => i.columnId === status && i.id !== id)
    const res = await moveTaskOnBoard({ id, status, beforeId: column[toIndex - 1]?.id, afterId: column[toIndex]?.id, blockedReason: reason?.reason })
    if (!res.ok) {
      toast.error(`Couldn't move '${task.title}'. ${res.error}`)
      return false
    }
    if (res.message) toast.success(res.message)
    router.refresh()
    return true
  }

  return (
    <>
      <TaskOrder ids={rows.map((r) => r.id)} />
      <Kanban
        columns={columns}
        items={items}
        disabled={!data.canWrite}
        emptyLabel="No tasks"
        onMove={onMove}
        columnFooter={(col) => (data.canWrite ? <QuickAdd context={{ ...quickAdd, status: col.id as TaskStatus }} placeholder="Add a task" className="h-9 [&_input]:h-9" /> : null)}
        renderItem={(t) => <BoardCard task={t} />}
      />
      <BlockedDialog
        open={Boolean(block)}
        taskTitle={block?.task.title}
        onCancel={() => {
          block?.resolve(null)
          setBlock(null)
        }}
        onConfirm={(value) => {
          block?.resolve(value)
          setBlock(null)
        }}
      />
    </>
  )
}

function BoardCard({ task }: { task: TaskRow }) {
  const data = useTaskData()
  const project = data.projects.find((p) => p.id === task.projectId)
  return (
    <KanbanCard className="group relative space-y-2.5">
      {/* On touch the actions always show, so the header makes room for them. */}
      <div className="flex items-center justify-between gap-2 touch:pr-9">
        <span className="flex min-w-0 items-center gap-1.5 text-xs tabular-nums text-[#797779]"><TaskClientLogo clientId={task.clientId} />{task.key}<RelationFlagMarks flags={task.flags} /></span>
        <PriorityLabel priority={task.priority} />
      </div>
      {/* Hover actions float over the header so the priority stays right-aligned when they're hidden. */}
      <div className="absolute right-1.5 top-1.5 rounded-full bg-[#1d1d1f] opacity-0 transition-opacity group-hover:opacity-100 touch:opacity-100 focus-within:opacity-100" {...noDrag}>
        <TaskRowMenu task={task} />
      </div>
      <Link href={`/app/work/tasks/${task.id}`} scroll={false} className={cn('block text-sm font-medium leading-snug text-white transition-colors hover:text-blush', task.status === 'done' && 'text-fg-2 line-through decoration-white/30')}>
        {task.title}
      </Link>
      {task.status === 'blocked' && task.blockedReason ? <p className="line-clamp-2 rounded-lg bg-[#FAB5E8]/[0.12] px-2 py-1 text-xs leading-4 text-pink">{task.blockedReason}</p> : null}
      <div className="flex flex-wrap items-center gap-1.5">
        {project ? <ProjectChip code={project.code} name={project.name} /> : null}
        <CountChip done={task.subtasks.done} total={task.subtasks.total} label="Subtasks done" />
        <CountChip done={task.checklist.done} total={task.checklist.total} label="Checklist done" />
        {task.isPersonal ? <Lock className="size-3 text-fg-3" aria-label="Personal" /> : null}
      </div>
      <div className="flex items-center justify-between gap-2">
        <DueText dueDate={task.dueDate} today={data.today} done={task.status === 'done'} />
        <AvatarStack size="xs" max={3} people={task.assigneeIds.map(data.avatar)} />
      </div>
      {task.isPersonal && task.sharedWith.length ? (
        <div className="flex items-center gap-1.5 text-[11px] text-fg-2">
          Shared with <AvatarStack size="xs" max={3} people={task.sharedWith.map((id) => ({ name: data.nameOf(id) }))} />
        </div>
      ) : null}
    </KanbanCard>
  )
}
