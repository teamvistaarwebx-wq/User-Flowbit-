'use client'

import { AlignLeft, CalendarDays, ChartNoAxesColumn, ListChecks, Lock, SquareCheckBig, UserRound } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { AvatarStack } from '@/components/ui/avatar'
import { PriorityLabel, Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { EmptyState } from '@/components/ui/empty-state'
import { Button } from '@/components/ui/button'
import { HEAD_ROW, PanelHeader, rowClass, Th } from '../shared/table'
import { BulkBar } from './bulk-bar'
import { CreateTaskDialog, type TaskDefaults } from './create-task-dialog'
import { QuickAdd, type QuickAddContext } from './quick-add'
import { CountChip, DueText, ProjectChip, RelationFlagMarks, StatusIcon } from './task-bits'
import { useTaskData } from './task-data'
import { TaskRowMenu } from './task-row-menu'
import type { TaskRow } from './types'
import { TaskClientLogo } from './client-logo'
import { TaskOrder } from './panel/task-order'

export type TaskListProps = {
  rows: TaskRow[]
  quickAdd?: QuickAddContext
  createDefaults?: TaskDefaults
  emptyTitle: string
  /** Card heading ("All tasks", "Assigned to me") and the grey line under it. */
  title?: string
  subtitle?: string
}

/**
 * List view, built like Home's "Assign to me": an opaque table card with a labelled header, a ruled column
 * row with outline icons, and plain 40px rows. Rows can be selected for bulk actions; quick add sits on top.
 */
export function TaskList({ rows, quickAdd, createDefaults, emptyTitle, title = 'Tasks', subtitle }: TaskListProps) {
  const data = useTaskData()
  const [selected, setSelected] = useState<string[]>([])
  const editable = rows.filter((r) => r.canEdit).map((r) => r.id)
  const allChecked = editable.length > 0 && editable.every((id) => selected.includes(id))
  const toggle = (id: string, on: boolean) => setSelected((s) => (on ? [...s, id] : s.filter((x) => x !== id)))

  return (
    <div className="space-y-3">
      <TaskOrder ids={rows.map((r) => r.id)} />
      {data.canWrite && quickAdd ? <QuickAdd context={quickAdd} placeholder="Add a task: try “kal 5 baje @name #project p1”" /> : null}
      <section aria-label={title} className="card-table overflow-hidden">
        <PanelHeader icon={<ListChecks />} title={title} subtitle={subtitle} className="px-[23px] pb-4 pt-[17px]" />
        <div className="overflow-x-auto">
          <table className="w-full border-collapse sm:min-w-[640px]">
            <thead>
              <tr className={HEAD_ROW}>
                <th scope="col" className="w-12 pl-[23px] pr-2 text-left">
                  <Checkbox aria-label="Select all" checked={allChecked} onCheckedChange={(on) => setSelected(on ? editable : [])} />
                </th>
                <Th icon={<AlignLeft />} className="pl-0">Task Name</Th>
                <Th icon={<UserRound />} className="hidden md:table-cell">Assignee</Th>
                <Th icon={<CalendarDays />}>Due</Th>
                <Th icon={<ChartNoAxesColumn />} className="hidden sm:table-cell">Priority</Th>
                <th scope="col" className="w-16 pr-[15px]" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {rows.length ? <tr aria-hidden className="h-1.5" /> : null}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <EmptyState
                      compact
                      icon={<SquareCheckBig />}
                      title={emptyTitle}
                      description="Tasks you can see show up here."
                      action={data.canWrite ? <CreateTaskDialog defaults={createDefaults} trigger={<Button variant="primary">Create your first task</Button>} /> : undefined}
                    />
                  </td>
                </tr>
              ) : null}
              {rows.map((t) => {
                const project = data.projects.find((p) => p.id === t.projectId)
                const isSelected = selected.includes(t.id)
                return (
                  <tr key={t.id} className={cn(rowClass(isSelected), 'h-10')}>
                    <td className="pl-[23px] pr-2">
                      <Checkbox aria-label={`Select ${t.title}`} disabled={!t.canEdit} checked={isSelected} onCheckedChange={(on) => toggle(t.id, on)} />
                    </td>
                    {/* On a phone the title column takes the width and truncates, so Due stays on screen without scrolling. */}
                    <td className="w-full max-w-0 py-1.5 pr-3 sm:min-w-64 sm:max-w-none">
                      <div className="flex min-w-0 items-center gap-[11px]">
                        <StatusIcon status={t.status} />
                        <TaskClientLogo clientId={t.clientId} />
                        <Link href={`/app/work/tasks/${t.id}`} scroll={false} className={cn('min-w-0 truncate text-sm transition-colors', t.status === 'done' ? 'text-fg-2 line-through decoration-white/30' : 'text-white hover:text-blush')}>
                          {t.title}
                        </Link>
                        <span className="hidden shrink-0 text-xs tabular-nums text-[#797779] lg:inline">{t.key}</span>
                        <RelationFlagMarks flags={t.flags} />
                        {t.status === 'blocked' ? <Badge tone="pink" className="h-5 px-2 text-[11px]">Blocked</Badge> : null}
                        {t.isPersonal ? <Badge icon={<Lock className="size-3" />} className="h-5 px-2 text-[11px]">Personal</Badge> : null}
                        <span className="hidden shrink-0 items-center gap-[11px] sm:inline-flex">
                          <CountChip done={t.subtasks.done} total={t.subtasks.total} label="Subtasks done" />
                          {project ? <ProjectChip code={project.code} name={project.name} /> : null}
                        </span>
                      </div>
                    </td>
                    <td className="hidden px-3 md:table-cell">
                      <AvatarStack size="xs" max={3} people={t.assigneeIds.map(data.avatar)} />
                    </td>
                    <td className="px-3">
                      <DueText dueDate={t.dueDate} today={data.today} done={t.status === 'done'} />
                    </td>
                    <td className="hidden px-3 sm:table-cell">
                      <PriorityLabel priority={t.priority} />
                    </td>
                    <td className="pr-[15px] text-right opacity-60 transition-opacity group-hover:opacity-100 focus-within:opacity-100 touch:opacity-100">
                      <TaskRowMenu task={t} />
                    </td>
                  </tr>
                )
              })}
              {rows.length ? <tr aria-hidden className="h-2" /> : null}
            </tbody>
          </table>
        </div>
      </section>
      <BulkBar ids={selected.filter((id) => rows.some((r) => r.id === id))} onClear={() => setSelected([])} />
    </div>
  )
}
