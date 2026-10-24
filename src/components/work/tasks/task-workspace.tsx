import { CalendarClock, CircleSlash, Flag, Layers, Lock, Plus, TriangleAlert, UserRound, Clock3 } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Ctx } from '@/lib/ctx'
import { monthOf, shiftMonth } from '@/lib/dates'
import type { SearchParams } from '@/lib/list'
import { Button } from '@/components/ui/button'
import { Pagination } from '@/components/ui/pagination'
import type { Viewer } from '@/modules/work/tasks/access'
import { EMPTY_QUERY, taskQueryString, type TaskQuery } from '@/modules/work/tasks/filters'
import { boardTasks, calendarTasks, LIST_PAGE_SIZE, listTasks } from '@/modules/work/tasks/queries'
import { CreateTaskDialog, type TaskDefaults } from './create-task-dialog'
import { FilterChips } from './filter-chips'
import { tasksHref, type LockedFilter } from './href'
import { PillLinks, type PillLink } from './pill-links'
import type { QuickAddContext } from './quick-add'
import { taskViewContext } from '@/modules/work/tasks/quick-context'
import { TaskBoard } from './task-board'
import { TaskCalendar } from './task-calendar'
import { TaskDataProvider } from './task-data'
import { TaskList } from './task-list'
import { TaskToolbar } from './task-toolbar'
import type { SavedViewOption, TaskData } from './types'

export type TaskWorkspaceProps = {
  ctx: Ctx
  viewer: Viewer
  data: TaskData
  query: TaskQuery
  /** Path (plus fixed params such as ?tab=tasks) the toolbar links to. */
  basePath: string
  /** Pathname and raw params, for pagination links. */
  pathname: string
  sp: SearchParams
  locked?: LockedFilter[]
  savedViews?: SavedViewOption[]
  quickLinks?: boolean
  /** A '+ Task' button that opens the full create dialog with this page's context filled in. */
  createButton?: boolean
}

/** Predefined views (old "task pages") as quick links. */
function quickLinks(q: TaskQuery, basePath: string, personalMode: boolean): PillLink[] {
  const base: TaskQuery = { ...EMPTY_QUERY, view: q.view }
  const signature = (x: TaskQuery) => taskQueryString(x, { view: 'board', sort: null, order: 'desc', page: 1, month: null, saved: null })
  const isOnly = (patch: Partial<TaskQuery>) => signature({ ...base, ...patch }) === signature(q)
  const link = (label: string, patch: Partial<TaskQuery>, icon?: ReactNode): PillLink => ({ label, icon, href: tasksHref(basePath, base, patch), active: isOnly(patch) })
  const team = [
    link('All tasks', {}, <Layers />),
    link('My tasks', { mine: true }, <UserRound />),
    link('High priority', { priority: ['high', 'urgent'] }, <Flag />),
    link('Due today', { due: 'today' }, <Clock3 />),
    link('Overdue', { due: 'overdue' }, <TriangleAlert />),
    link('This week', { due: 'week' }, <CalendarClock />),
    link('Blocked', { status: ['blocked'] }, <CircleSlash />),
  ]
  const personal = link('Personal', { personal: true }, <Lock />)
  return personalMode ? [personal, ...team] : [...team, personal]
}

/** Card heading for the list view, named after what the filters show. */
const listTitle = (q: TaskQuery) => (q.personal ? 'Personal tasks' : q.mine ? 'Assigned to me' : 'All tasks')

/** "Showing 25 of 140 tasks" under the list heading. */
function listSubtitle(shown: number, total: number): string | undefined {
  if (!total) return undefined
  const noun = total === 1 ? 'task' : 'tasks'
  if (shown >= total) return total === 1 ? 'Showing 1 task' : `Showing all ${total} ${noun}`
  return `Showing ${shown} of ${total} ${noun}`
}

/** Toolbar + quick links + chips + the chosen view, used by Tasks, a space's Tasks tab and a project's Tasks tab. */
export async function TaskWorkspace({ ctx, viewer, data, query, basePath, pathname, sp, locked = [], savedViews, quickLinks: showLinks, createButton }: TaskWorkspaceProps) {
  // In a space, new tasks stay in it: the picked list, else its only list (with several, the server asks for one).
  const spaceLists = query.space ? (data.spaces.find((s) => s.id === query.space)?.folders ?? []) : []
  const quickAdd: QuickAddContext = taskViewContext(query, spaceLists)
  const createDefaults: TaskDefaults = { ...quickAdd, assigneeIds: query.assignee.length ? query.assignee : undefined }
  const emptyTitle = query.q ? `No tasks found for "${query.q}"` : 'No tasks found'
  const month = query.month ?? monthOf(data.today)

  let view: ReactNode
  if (query.view === 'list') {
    const { rows, total } = await listTasks(ctx, viewer, query, data.today)
    view = (
      <>
        <TaskList rows={rows} quickAdd={quickAdd} createDefaults={createDefaults} emptyTitle={emptyTitle} title={listTitle(query)} subtitle={listSubtitle(rows.length, total)} />
        <Pagination page={query.page} pageSize={LIST_PAGE_SIZE} total={total} basePath={pathname} params={sp} />
      </>
    )
  } else if (query.view === 'calendar') {
    const { rows, undated } = await calendarTasks(ctx, viewer, query, data.today, month)
    view = (
      <TaskCalendar
        rows={rows}
        undated={undated}
        month={month}
        quickAdd={quickAdd}
        prevHref={tasksHref(basePath, query, { month: shiftMonth(month, -1) })}
        nextHref={tasksHref(basePath, query, { month: shiftMonth(month, 1) })}
        todayHref={tasksHref(basePath, query, { month: null })}
      />
    )
  } else {
    const { rows, statuses, totals } = await boardTasks(ctx, viewer, query, data.today)
    view = <TaskBoard rows={rows} statuses={statuses} totals={totals} quickAdd={quickAdd} />
  }

  return (
    <TaskDataProvider value={data}>
      <div className="space-y-4">
        {createButton && data.canWrite ? (
          <div className="flex flex-wrap items-start gap-2">
            <div className="min-w-0 flex-1">
              <TaskToolbar query={query} basePath={basePath} locked={locked} savedViews={savedViews} />
            </div>
            <CreateTaskDialog defaults={createDefaults} trigger={<Button variant="primary" size="sm" icon={<Plus className="size-4" />}>Task</Button>} />
          </div>
        ) : (
          <TaskToolbar query={query} basePath={basePath} locked={locked} savedViews={savedViews} />
        )}
        {showLinks ? <PillLinks items={quickLinks(query, basePath, data.personalMode)} /> : null}
        <FilterChips query={query} basePath={basePath} locked={locked} />
        {view}
      </div>
    </TaskDataProvider>
  )
}
