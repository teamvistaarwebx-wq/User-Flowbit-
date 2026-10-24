'use client'

import { BriefcaseBusiness, CalendarClock, CalendarDays, ChartNoAxesColumn, Component, Flag, Hourglass, Layers, Loader, Pencil, Tag, UsersRound } from 'lucide-react'
import { createContext, useContext, useState, type ReactNode } from 'react'
import { ESTIMATE_PRESETS, PRIORITY_LABEL, STATUS_LABEL, TASK_PRIORITIES, TASK_STATUSES, WORKDAY_MINUTES, type TaskPriority, type TaskStatus } from '@/modules/work/tasks/constants'
import { parseDuration } from '@/modules/work/tasks/duration'
import { formatDate, formatDuration } from '@/lib/dates'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { AvatarStack } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input, NativeSelect } from '@/components/ui/input'
import { Popover } from '@/components/ui/popover'
import { Select } from '@/components/ui/select'
import { BlockedDialog } from '../blocked-dialog'
import { DatePicker } from '../date-picker'
import { PeoplePicker } from '../people-picker'
import { TagsInput } from '../tags-input'
import { useTaskData } from '../task-data'
import type { MilestoneOption, TaskRow } from '../types'
import { leaveWarning } from '@/modules/work/presence-core'
import { useTaskPatch } from './use-patch'
import { TaskClientLogo } from '../client-logo'

export type AttributePanelProps = {
  task: TaskRow
  clientId: string | null
  milestoneId: string | null
  estimateMinutes: number | null
  loggedMinutes: number
  milestones: MilestoneOption[]
  isSubtask: boolean
  /** Narrow label column (the task panel's properties column). */
  compact?: boolean
}

const Compact = createContext(false)

/** A fact row from Home's Project overview: a 16px outline icon + the label, then the value (34px pitch). */
function Row({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  const compact = useContext(Compact)
  return (
    <div className={cn('grid items-center gap-3 py-[3px]', compact ? 'grid-cols-[112px_1fr]' : 'grid-cols-[132px_1fr] sm:grid-cols-[150px_1fr]')}>
      <span className="flex min-h-8 items-center gap-2 text-sm text-white [&_svg]:size-4 [&_svg]:shrink-0">
        {icon}
        {label}
      </span>
      {/* One value column width, so the selects line up instead of mixing short and full-width fields. */}
      <div className="min-w-0 max-w-[420px]">{children}</div>
    </div>
  )
}

const ghost = 'h-8 justify-start px-2.5 text-[13px] font-normal text-white'

/** Never equal to a real tag list: forces the panel to take the server's tags again. */
const STALE_TAGS = '\u0000stale'

/** Status, priority, people, dates, estimate, tags and location — each edit saves on its own. */
export function AttributePanel({ task, clientId, milestoneId, estimateMinutes, loggedMinutes, milestones, isSubtask, compact = false }: AttributePanelProps) {
  const data = useTaskData()
  const [patch, pending] = useTaskPatch(task.id)
  const [blocking, setBlocking] = useState(false)
  const [assignees, setAssignees] = useState(task.assigneeIds)
  const [estimate, setEstimate] = useState('')
  const can = task.canEdit
  const folders = data.spaces.find((s) => s.id === task.spaceId)?.folders ?? []
  const [spaceDraft, setSpaceDraft] = useState(task.spaceId ?? '')
  const draftFolders = data.spaces.find((s) => s.id === spaceDraft)?.folders ?? []

  const saveAssignees = (open: boolean) => {
    if (open) return setAssignees(task.assigneeIds)
    if (assignees.join() === task.assigneeIds.join()) return
    if (!assignees.length) {
      toast.error('A task needs at least one assignee')
      setAssignees(task.assigneeIds)
      return
    }
    void patch({ assigneeIds: assignees })
    warnLeave(assignees.filter((id) => !task.assigneeIds.includes(id)), task.dueDate)
  }
  const saveDue = (d: string | null) => {
    void patch({ dueDate: d })
    warnLeave(task.assigneeIds, d)
  }
  /** Non-blocking: the change saves, and a note says who is on leave on the due date. */
  const warnLeave = (ids: string[], date: string | null) => {
    const away = leaveWarning(data.people, ids, date)
    if (away) toast.info(`${away}. The task is still assigned.`)
  }
  const saveEstimate = (minutes: number | null) => void patch({ estimateMinutes: minutes })

  // Tags show at once and each save sends the newest full list, so a second tag added before
  // the first save returns keeps the first. Server tags take over again once no save is running.
  const [tags, setTags] = useState(task.tags)
  const [tagSaves, setTagSaves] = useState(0)
  const serverTags = task.tags.join('\n')
  const [syncedTags, setSyncedTags] = useState(serverTags)
  if (syncedTags !== serverTags && !tagSaves) {
    setSyncedTags(serverTags)
    setTags(task.tags)
  }
  const saveTags = async (next: string[]) => {
    setTags(next)
    setTagSaves((n) => n + 1)
    const res = await patch({ tags: next })
    setTagSaves((n) => n - 1)
    // Failed: show what the server has (resynced on the next render).
    if (!res.ok) setSyncedTags(STALE_TAGS)
  }
  const over = estimateMinutes ? loggedMinutes > estimateMinutes : false

  return (
    <Compact.Provider value={compact}>
      <div className={cn('transition-opacity', pending && 'opacity-80')}>
        <Row icon={<Loader />} label="Status">
          <Select
            size="sm"
            disabled={!can}
            value={task.status}
            aria-label="Status"
            onValueChange={(v) => (v === 'blocked' ? setBlocking(true) : void patch({ status: v as TaskStatus }))}
            options={TASK_STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] }))}
            className="w-full"
          />
        </Row>
        {task.status === 'blocked' ? (
          <Row icon={<Flag />} label="Blocked because">
            <div className="flex items-start gap-2 rounded-lg bg-[#FAB5E8]/[0.12] px-3 py-2 text-[13px] text-pink">
              <span className="flex-1">{task.blockedReason}</span>
              {can ? <button type="button" aria-label="Edit reason" onClick={() => setBlocking(true)}><Pencil className="size-3.5" /></button> : null}
            </div>
          </Row>
        ) : null}
        <Row icon={<ChartNoAxesColumn />} label="Priority">
          <Select size="sm" disabled={!can} value={task.priority} aria-label="Priority" onValueChange={(v) => void patch({ priority: v as TaskPriority })} options={TASK_PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABEL[p] }))} className="w-full" />
        </Row>
        <Row icon={<UsersRound />} label="Assignees">
          {can && !task.isPersonal ? (
            <PeoplePicker
              people={data.activePeople}
              value={assignees}
              onChange={setAssignees}
              onOpenChange={saveAssignees}
              priorityIds={[task.creatorId]}
              trigger={
                <Button variant="ghost" className={ghost}>
                  <AvatarStack size="xs" max={4} people={task.assigneeIds.map(data.avatar)} />
                  <span className="truncate">{task.assigneeIds.map((id) => data.nameOf(id)).join(', ')}</span>
                </Button>
              }
            />
          ) : (
            <span className="text-sm text-white">{task.assigneeIds.map((id) => data.nameOf(id)).join(', ')}</span>
          )}
        </Row>
        <Row icon={<CalendarDays />} label="Start date">
          <DatePicker value={task.startDate} today={data.today} label="Start date" onChange={(d) => void patch({ startDate: d })} trigger={<Button variant="ghost" className={ghost} disabled={!can} icon={<CalendarDays className="size-3.5 text-icon-muted" />}>{task.startDate ? formatDate(task.startDate) : 'None'}</Button>} />
        </Row>
        <Row icon={<CalendarClock />} label="Due date">
          <DatePicker value={task.dueDate} today={data.today} label="Due date" onChange={saveDue} trigger={<Button variant="ghost" className={cn(ghost, task.dueDate && task.dueDate < data.today && task.status !== 'done' && 'text-[#FF2D31]')} disabled={!can} icon={<CalendarDays className="size-3.5 text-icon-muted" />}>{task.dueDate ? formatDate(task.dueDate) : 'None'}</Button>} />
        </Row>
        <Row icon={<Hourglass />} label="Estimate">
          <Popover
            trigger={
              <Button variant="ghost" className={ghost} disabled={!can} icon={<Hourglass className="size-3.5 text-icon-muted" />}>
                {estimateMinutes ? formatDuration(estimateMinutes) : 'None'}
                {loggedMinutes ? <span className={cn('text-fg-3', over && 'text-[#FF6A66]')}>· logged {formatDuration(loggedMinutes)}</span> : null}
              </Button>
            }
          >
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.06em] text-fg-2">Estimate (1 day = {WORKDAY_MINUTES / 60} h)</p>
            <div className="flex flex-wrap gap-1.5">
              {ESTIMATE_PRESETS.map((p) => (
                <button key={p.label} type="button" onClick={() => saveEstimate(p.minutes)} className="press rounded-full border border-white/[0.12] bg-control px-2.5 py-1 text-xs text-fg-2 transition-colors hover:border-white/25 hover:text-white">
                  {p.label}
                </button>
              ))}
            </div>
            <form
              className="mt-3 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                const minutes = parseDuration(estimate)
                if (minutes == null) return toast.error('Use a duration like 1h 30m, 2d or 45m')
                saveEstimate(minutes)
                setEstimate('')
              }}
            >
              <Input inputSize="sm" value={estimate} onChange={(e) => setEstimate(e.target.value)} placeholder="e.g. 3h 30m" aria-label="Custom estimate" />
              <Button type="submit" size="sm">Set</Button>
            </form>
            {estimateMinutes ? <Button variant="ghost" size="sm" className="mt-2 w-full" onClick={() => saveEstimate(null)}>Clear estimate</Button> : null}
          </Popover>
        </Row>
        <Row icon={<Tag />} label="Tags">
          {can ? <TagsInput value={tags} onChange={(next) => void saveTags(next)} /> : <span className="text-sm text-fg-2">{task.tags.join(', ') || '—'}</span>}
        </Row>
        {!task.isPersonal ? (
          <>
            <Row icon={<Component />} label="Project">
              <NativeSelect aria-label="Project" disabled={!can || isSubtask} value={task.projectId ?? ''} onChange={(e) => void patch({ projectId: e.target.value || null })} placeholder="No project" options={data.projects.map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` }))} className="h-8 text-[13px]" />
            </Row>
            {task.projectId ? (
              <Row icon={<Flag />} label="Milestone">
                <NativeSelect aria-label="Milestone" disabled={!can} value={milestoneId ?? ''} onChange={(e) => void patch({ milestoneId: e.target.value || null })} placeholder="No milestone" options={milestones.map((m) => ({ value: m.id, label: `${m.title} · ${formatDate(m.dueDate, { short: true })}` }))} className="h-8 text-[13px]" />
              </Row>
            ) : null}
            <Row icon={<BriefcaseBusiness />} label="Client">
              <span className="flex items-center gap-2">
              <TaskClientLogo clientId={clientId} size="md" />
              <NativeSelect aria-label="Client" disabled={!can} value={clientId ?? ''} onChange={(e) => void patch({ clientId: e.target.value || null })} placeholder="No client" options={data.clients.map((c) => ({ value: c.id, label: c.name }))} className="h-8 min-w-0 flex-1 text-[13px]" />
              </span>
            </Row>
            <Row icon={<Layers />} label="Space / list">
              <div className={cn('grid grid-cols-1 gap-2', !compact && 'sm:grid-cols-2')}>
                <NativeSelect
                  aria-label="Space"
                  disabled={!can || isSubtask}
                  value={spaceDraft}
                  onChange={(e) => {
                    setSpaceDraft(e.target.value)
                    if (!e.target.value) void patch({ spaceId: null, folderId: null })
                  }}
                  placeholder="No space"
                  options={data.spaces.map((s) => ({ value: s.id, label: s.name }))}
                  className="h-8 text-[13px]"
                />
                <NativeSelect
                  aria-label="List"
                  disabled={!can || isSubtask || !spaceDraft}
                  value={spaceDraft === task.spaceId ? (task.folderId ?? '') : ''}
                  onChange={(e) => e.target.value && void patch({ spaceId: spaceDraft, folderId: e.target.value })}
                  placeholder="Pick a list"
                  options={(spaceDraft === task.spaceId ? folders : draftFolders).map((f) => ({ value: f.id, label: f.name }))}
                  className="h-8 text-[13px]"
                />
              </div>
            </Row>
          </>
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
    </Compact.Provider>
  )
}
