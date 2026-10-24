import Link from 'next/link'
import { Activity, CheckCheck, Clock3, Component, Layers, Link2, ListChecks, ListTodo, Lock, Paperclip, SlidersHorizontal, Text } from 'lucide-react'
import { formatDateTime } from '@/lib/dates'
import { AvatarStack } from '@/components/ui/avatar'
import { Badge, StatusPill } from '@/components/ui/badge'
import { Card, CardHeader } from '@/components/ui/card'
import { ClientMark } from '@/components/clients/client-mark'
import { peopleIndex } from '@/modules/work/tasks/people'
import { ActivityPanel } from './activity-panel'
import { AttachmentsPanel, type AttachmentRow } from './attachments-panel'
import { AttributePanel } from './attribute-panel'
import { ChecklistPanel } from './checklist-panel'
import { DescriptionEditor } from './description-editor'
import type { TaskView } from './load-task-view'
import { RelationsPanel } from './relations-panel'
import { SubtasksPanel } from './subtasks-panel'
import { TimePanel } from './time-panel'
import { TaskPortalControls } from '@/components/portal/share-switches'

/**
 * The task's cards, shared by the full page and the side panel so both show the same
 * thing through the same components. Each takes the loaded view.
 */

/** Project and space links under the title: the secondary pill (#171717 + translucent hairline). */
const META_PILL = 'inline-flex h-6 items-center gap-1.5 rounded-full border border-white/[0.18] bg-control px-2.5 text-xs text-white'

export function TaskMetaPills({ view, showCreator = true }: { view: TaskView; showCreator?: boolean }) {
  const { task, detail, row } = view
  const projectLabel = detail.project ? <><Component className="size-3" /> {detail.project.code} · {detail.project.name}</> : null
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="font-medium tabular-nums text-[#979797]">{task.key}</span>
      <StatusPill status={row.status} />
      {row.isPersonal ? <Badge icon={<Lock className="size-3" />}>Personal</Badge> : null}
      {detail.project ? (
        // A task can be visible (assignee, space, team lead) without its project being open to the viewer (Work A5.2).
        view.projectLinkable ? (
          <Link href={`/app/work/projects/${detail.project._id}`} className={`${META_PILL} transition-colors hover:border-white/30`}>{projectLabel}</Link>
        ) : (
          <span className={META_PILL}>{projectLabel}</span>
        )
      ) : null}
      {detail.client ? (
        <span className={META_PILL}>
          <ClientMark name={detail.client.name} kind={detail.client.kind} size="xs" logoUrl={view.clientLogoUrl} /> {detail.client.name}
        </span>
      ) : null}
      {detail.space ? (
        <Link href={`/app/work/spaces/${detail.space._id}`} className={`${META_PILL} transition-colors hover:border-white/30`}>
          <Layers className="size-3" />
          {detail.space.name}{detail.folder ? ` / ${detail.folder.name}` : ''}
        </Link>
      ) : null}
      {showCreator ? <span className="text-[#979797]">Created by {view.creatorName} · {formatDateTime(task.createdAt)}</span> : null}
    </div>
  )
}

export function DetailsCard({ view, className, compact }: { view: TaskView; className?: string; compact?: boolean }) {
  const { task, detail, row } = view
  return (
    // The task's facts in Home's Project overview glass: the brightest card on the page.
    <Card className={className ?? 'lit-edge-bright rounded-[14px] bg-white/[0.09] px-[15px] pb-4 pt-[17px] sm:px-5'}>
      <CardHeader label="Details" icon={<SlidersHorizontal />} description="Each change saves on its own" />
      <AttributePanel task={row} clientId={task.clientId ? String(task.clientId) : null} milestoneId={task.milestoneId ? String(task.milestoneId) : null} estimateMinutes={task.estimateMinutes ?? null} loggedMinutes={task.loggedMinutes ?? 0} milestones={detail.milestones.map((m) => ({ id: String(m._id), title: m.title, dueDate: m.dueDate }))} isSubtask={Boolean(task.parentId)} compact={compact} />
      {view.portal ? <div className="mt-3"><TaskPortalControls taskId={row.id} state={view.portal} /></div> : null}
    </Card>
  )
}

export function DescriptionCard({ view }: { view: TaskView }) {
  return (
    <Card variant="solid">
      <CardHeader label="Description" icon={<Text />} />
      <DescriptionEditor id={view.row.id} description={view.task.description ?? ''} canEdit={view.row.canEdit} />
    </Card>
  )
}

/** Subtasks (top-level tasks only) and the checklist, side by side when there is room. */
export function WorkCards({ view, wide = true }: { view: TaskView; wide?: boolean }) {
  const { task, detail, row, data } = view
  return (
    <div className={wide ? 'grid gap-4 lg:grid-cols-2' : 'grid gap-4'}>
      {!task.parentId ? (
        <Card variant="solid">
          <CardHeader label="Subtasks" icon={<ListTodo />} />
          <SubtasksPanel parentId={row.id} subtasks={detail.subtasks} canAdd={row.canEdit && data.canWrite} />
        </Card>
      ) : null}
      <Card variant="solid" className={task.parentId && wide ? 'lg:col-span-2' : undefined}>
        <CardHeader label="Checklist" icon={<ListChecks />} />
        <ChecklistPanel taskId={row.id} items={view.checklist} canEdit={row.canEdit} />
      </Card>
    </div>
  )
}

export function RelationsCard({ view }: { view: TaskView }) {
  return (
    <Card variant="solid">
      <CardHeader label="Relations" icon={<Link2 />} description="Blocked by, blocks and related tasks" />
      <RelationsPanel task={view.row} relations={view.relations} />
    </Card>
  )
}

export function AttachmentsCard({ view }: { view: TaskView }) {
  return (
    <Card variant="solid">
      <CardHeader label="Attachments" icon={<Paperclip />} />
      <AttachmentsPanel taskId={view.row.id} items={view.detail.attachments as AttachmentRow[]} canEdit={view.row.canEdit} />
    </Card>
  )
}

export function TimeCard({ view }: { view: TaskView }) {
  const { task, detail, row } = view
  const nameOf = peopleIndex(view.data.people).name
  return (
    <Card variant="solid">
      <CardHeader label="Time" icon={<Clock3 />} />
      <TimePanel taskId={row.id} entries={detail.time} loggedMinutes={task.loggedMinutes ?? 0} estimateMinutes={task.estimateMinutes ?? null} nameOf={nameOf} canLog={view.canLogTime} />
    </Card>
  )
}

export function ActivityCard({ view, className }: { view: TaskView; className?: string }) {
  return (
    <Card variant="table" className={className ?? 'px-[23px] pt-[17px]'}>
      <CardHeader label="Activity & comments" icon={<Activity />} description="Comments, changes and who made them" />
      <ActivityPanel taskId={view.row.id} comments={view.comments} activity={view.activity} priorityIds={view.priorityIds} />
    </Card>
  )
}

export function WatchersCard({ view }: { view: TaskView }) {
  return (
    <Card variant="solid">
      <CardHeader label="Watchers" icon={<CheckCheck />} description="Get status changes and comments." />
      <div className="flex items-center gap-3">
        <AvatarStack max={8} people={view.watchers} />
        <span className="text-[13px] tabular-nums text-fg-2">{(view.task.watcherIds ?? []).length} watching</span>
      </div>
    </Card>
  )
}
