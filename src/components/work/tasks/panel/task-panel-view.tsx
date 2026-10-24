import { CalendarClock, ChartNoAxesColumn, UsersRound } from 'lucide-react'
import type { ReactNode } from 'react'
import { AvatarStack } from '@/components/ui/avatar'
import { PriorityLabel } from '@/components/ui/badge'
import { onLeaveOn } from '@/modules/work/presence-core'
import { formatClock } from '@/modules/work/tasks/quick-parse'
import { peopleIndex } from '@/modules/work/tasks/people'
import type { TaskView } from '../detail/load-task-view'
import { TaskActionsBar } from '../detail/task-actions-bar'
import { ActivityCard, AttachmentsCard, DescriptionCard, DetailsCard, RelationsCard, TaskMetaPills, TimeCard, WatchersCard, WorkCards } from '../detail/task-sections'
import { TitleEditor } from '../detail/title-editor'
import { DueText, RelationFlagMarks } from '../task-bits'

function Fact({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="text-icon-muted [&_svg]:size-3.5" aria-hidden>{icon}</span>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  )
}

/** Key fields under the title: assignees, due (with a quick-add time), priority and relation flags. */
function KeyFields({ view }: { view: TaskView }) {
  const { row, data } = view
  const people = peopleIndex(data.people)
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-white">
      <Fact icon={<UsersRound />} label="Assignees">
        <AvatarStack size="xs" max={4} people={row.assigneeIds.map((id) => ({ name: people.name(id), src: people.get(id)?.avatarUrl, away: onLeaveOn(people.get(id)?.leaveDates, data.today) }))} />
        <span className="max-w-[220px] truncate">{row.assigneeIds.map((id) => people.name(id)).join(', ')}</span>
      </Fact>
      <Fact icon={<CalendarClock />} label="Due">
        <DueText dueDate={row.dueDate} today={data.today} done={row.status === 'done'} />
        {row.dueTime && row.dueDate ? <span className="text-[13px] tabular-nums text-[#979797]">{formatClock(row.dueTime)}</span> : null}
      </Fact>
      <Fact icon={<ChartNoAxesColumn />} label="Priority">
        <PriorityLabel priority={row.priority} />
      </Fact>
      <RelationFlagMarks flags={row.flags} />
    </div>
  )
}

/**
 * The side panel's body: header (key fields), a main column (description, subtasks, checklist,
 * relations, attachments, activity) and a fixed properties column. Same cards as the task page.
 */
export function TaskPanelView({ view }: { view: TaskView }) {
  const { row, detail } = view
  return (
    <div className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-4">
        <header className="space-y-3">
          <TaskMetaPills view={view} showCreator={false} />
          <TitleEditor id={row.id} title={row.title} canEdit={row.canEdit} />
          <KeyFields view={view} />
          <TaskActionsBar task={row} watching={detail.watching} canShare={detail.canShare} />
        </header>
        <DescriptionCard view={view} />
        <WorkCards view={view} wide={false} />
        <RelationsCard view={view} />
        <AttachmentsCard view={view} />
        <ActivityCard view={view} />
      </div>
      <aside aria-label="Properties" className="space-y-4 lg:sticky lg:top-0 lg:self-start">
        <DetailsCard view={view} compact className="rounded-[14px] bg-white/[0.06] px-4 pb-3 pt-4" />
        <WatchersCard view={view} />
        <TimeCard view={view} />
        <p className="px-1 text-xs text-[#979797]">Created by {view.creatorName}</p>
      </aside>
    </div>
  )
}
