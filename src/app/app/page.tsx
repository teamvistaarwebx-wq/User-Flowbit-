import type { Metadata } from 'next'
import { after } from 'next/server'
import { Suspense, type ReactNode } from 'react'
import { ListChecks, Plus } from 'lucide-react'
import { requireMember, type Ctx } from '@/lib/ctx'
import { greeting, monthOf, monthRange, todayIST } from '@/lib/dates'
import { buildHref, first, type SearchParams } from '@/lib/list'
import { cn, firstName } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { StatCard } from '@/components/ui/stat-card'
import type { TaskData } from '@/components/work/tasks/types'
import { Project } from '@/models/work/Project'
import { Task } from '@/models/work/Task'
import { assignedToMe, attendanceMonth, homeStats, myTaskCounts, sendDueReminders, workdayData, type HomeTab } from '@/modules/work/dashboard/queries'
import { homeProjects } from '@/modules/work/projects/queries'
import { taskData } from '@/modules/work/tasks/options'
import { getViewer } from '@/modules/work/tasks/viewer'
import { ArcCard } from '@/components/work/dashboard/arc-card'
import { AssignedTable } from '@/components/work/dashboard/assigned-table'
import { AttendanceCard } from '@/components/work/dashboard/attendance-card'
import { GettingStarted } from '@/components/work/dashboard/getting-started'
import { OnboardingCard } from '@/components/activation/onboarding-card'
import { ApprovalsCard } from '@/components/approvals/approvals-card'
import { AnnouncementPopupLoader } from '@/components/work/posts/announcement-popup-loader'
import { MyTasksOverview, ProjectOverview } from '@/components/work/dashboard/project-overview'
import { SegmentedLinks } from '@/components/work/dashboard/segmented-links'
import { WorkdayTimeline } from '@/components/work/dashboard/workday-timeline'
import { CreateTaskDialog } from '@/components/work/tasks/create-task-dialog'
import { TaskDataProvider } from '@/components/work/tasks/task-data'
import { mergeBreakPolicies } from '@/lib/break-types'
import { localeOfUser } from '@/lib/i18n'

export const metadata: Metadata = { title: 'Home' }

const TABS: HomeTab[] = ['all', 'done', 'due']
/** "Friday, 2 October" under the greeting (Figma: weekday and date, no year). */
const LONG_DATE = new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata' })

function pickMonth(sp: SearchParams, today: string): string {
  const m = first(sp.month)
  return m && /^\d{4}-\d{2}$/.test(m) && m <= monthOf(today) ? m : monthOf(today)
}

function pickDay(sp: SearchParams, month: string, today: string): string {
  const d = first(sp.day)
  const { start, end } = monthRange(month)
  if (d && /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= start && d <= end) return d
  return month === monthOf(today) ? today : start
}

/**
 * Home, as the Figma dark dashboard: greeting, the thick workday timeline, then Arc beside the stat cards and
 * Project overview, then "Assign to me" beside "My attendance". Below about 1000px of content width the rows
 * stack; every card keeps its own shape.
 */
export default async function HomePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  const ctx = await requireMember()
  const today = todayIST()
  const work = ctx.has('work') && ctx.can('tasks.read')
  const personalMode = ctx.org.mode === 'personal'
  const scope = first(sp.scope) === 'all' && ctx.can('tasks.manage') ? 'all' : 'me'
  const tab = (TABS as string[]).includes(first(sp.tab) ?? '') ? (first(sp.tab) as HomeTab) : 'all'
  const month = pickMonth(sp, today)
  const day = pickDay(sp, month, today)
  const viewer = work ? await getViewer(ctx) : null

  // Every query starts now. The frame awaits only what it shows; the stat column and the bottom row
  // await theirs inside <Suspense> below and stream in when ready.
  const statsP = started(viewer ? homeStats(ctx, viewer, scope, today) : Promise.resolve(null))
  const projectsP = started(work && !personalMode && ctx.can('projects.read') ? homeProjects(ctx) : Promise.resolve([]))
  const myCountsP = started(work && personalMode ? myTaskCounts(ctx) : Promise.resolve(null))
  const assignedP = started(viewer ? assignedToMe(ctx, viewer, tab, today) : Promise.resolve(null))
  const attendanceP = started(attendanceMonth(ctx, month, today))
  const [workday, data, hasContent] = await Promise.all([
    workdayData(ctx, today),
    viewer ? taskData(ctx, viewer) : null,
    work ? Promise.all([ctx.db(Task).exists({}), ctx.db(Project).exists({})]).then(([t, p]) => Boolean(t || p)) : true,
  ])
  // Due-date reminders are writes the page does not show; run them after the response.
  if (work) after(() => sendDueReminders(ctx, today))
  const showArc = work && ctx.can('arc.use')
  const newTask = data?.canWrite ? (
    <CreateTaskDialog defaults={{ personal: personalMode }} trigger={<Button variant="secondary" icon={<Plus className="size-4" strokeWidth={1.5} />}>New task</Button>} />
  ) : undefined

  const page = (
    <div className="@container">
      <header className="flex flex-col gap-3 animate-slide-up sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-medium leading-6 text-white">
            {greeting()}, <span className="text-name">{firstName(ctx.user.name)}</span>
          </h1>
          <p className="mt-2 text-sm text-white">{LONG_DATE.format(new Date())}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {work && ctx.can('tasks.manage') ? (
            <SegmentedLinks label="Whose numbers" items={[{ href: buildHref('/app', sp, { scope: undefined }), label: 'Me', active: scope === 'me' }, { href: buildHref('/app', sp, { scope: 'all' }), label: 'Everyone', active: scope === 'all' }]} />
          ) : null}
          {newTask}
        </div>
      </header>

      <div className="mt-[22px] flex flex-col gap-3">
        <WorkdayTimeline hours={workday.hours} punches={workday.punches} status={workday.status} workWeek={workday.workWeek} today={today} nowIso={new Date().toISOString()} />
        <Suspense fallback={null}>
          <ApprovalsCard ctx={ctx} />
        </Suspense>
        <Suspense fallback={null}>
          <OnboardingCard ctx={ctx} fallback={work && !hasContent ? <GettingStarted canCreateProject={ctx.can('projects.write')} newTask={newTask} personalMode={personalMode} canLoadSample={ctx.can('org.manage')} /> : null} />
        </Suspense>
        {/* The stat column exists exactly when Work is on (stats need the viewer), so the grid is known before it loads. */}
        {work ? (
          <div className={cn('grid grid-cols-1 gap-3', showArc && '@min-[1000px]:grid-cols-[532.5fr_743fr] @min-[1000px]:gap-[14.5px]')}>
            {showArc ? <div className="order-last @min-[1000px]:order-none"><ArcCard /></div> : null}
            <Suspense fallback={<StatsColumnSkeleton />}>
              <StatsColumn ctx={ctx} sp={sp} scope={scope} personalMode={personalMode} data={data} statsP={statsP} projectsP={projectsP} myCountsP={myCountsP} />
            </Suspense>
          </div>
        ) : null}
        <Suspense fallback={<Skeleton className="mt-[5px] h-80 rounded-[10px]" />}>
          <BottomRow ctx={ctx} sp={sp} tab={tab} month={month} day={day} today={today} hours={workday.hours} data={data} newTask={newTask} personalMode={personalMode} assignedP={assignedP} attendanceP={attendanceP} />
        </Suspense>
      </div>
      {ctx.has('work') ? (
        <Suspense fallback={null}>
          <AnnouncementPopupLoader ctx={ctx} />
        </Suspense>
      ) : null}
    </div>
  )

  return data ? <TaskDataProvider value={data}>{page}</TaskDataProvider> : page
}

/**
 * Marks a started query as handled, so a page that fails before rendering the region that awaits it
 * does not leave an unhandled rejection. The region still receives (and throws) the error itself.
 */
function started<T>(promise: Promise<T>): Promise<T> {
  promise.catch(() => {})
  return promise
}

function StatsColumnSkeleton() {
  return (
    <div className="flex min-w-0 flex-col gap-3" aria-busy aria-label="Loading">
      <div className="grid gap-3 sm:grid-cols-3">
        <Skeleton className="h-[104px]" />
        <Skeleton className="h-[104px]" />
        <Skeleton className="h-[104px]" />
      </div>
      <Skeleton className="min-h-56 flex-1" />
    </div>
  )
}

/** In progress / Overdue / Completed cards and the project (or my tasks) overview, streamed in. */
async function StatsColumn({ ctx, sp, scope, personalMode, data, statsP, projectsP, myCountsP }: {
  ctx: Ctx
  sp: SearchParams
  scope: 'me' | 'all'
  personalMode: boolean
  data: TaskData | null
  statsP: Promise<Awaited<ReturnType<typeof homeStats>> | null>
  projectsP: ReturnType<typeof homeProjects>
  myCountsP: Promise<Awaited<ReturnType<typeof myTaskCounts>> | null>
}) {
  const [stats, projects, myCounts] = await Promise.all([statsP, projectsP, myCountsP])
  const selectedProject = projects.find((p) => p.id === first(sp.project)) ?? projects[0] ?? null
  const selectedDescription = selectedProject ? ((await ctx.db(Project).findById(selectedProject.id, { description: 1 }).lean())?.description ?? null) : null
  const showProjects = data && !personalMode && ctx.can('projects.read')
  const tasksLink = (q: string) => `/app/work/tasks?view=list${scope === 'me' ? '&mine=1' : ''}&${q}`
  const overview = data && myCounts ? <MyTasksOverview counts={myCounts} /> : showProjects ? <ProjectOverview projects={projects} selected={selectedProject} people={data.people} canCreate={ctx.can('projects.write')} description={selectedDescription} /> : null
  if (!stats && !overview) return null
  return (
    <div className="flex min-w-0 flex-col gap-3">
      {stats ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard label="In progress" value={stats.inProgress.value} delta={stats.inProgress.delta} trend={stats.inProgress.trend} color="var(--info)" href={tasksLink('status=in_progress,in_review')} />
          <StatCard label="Overdue" value={stats.overdue.value} delta={stats.overdue.delta} invert trend={stats.overdue.trend} color="var(--danger)" href={tasksLink('due=overdue')} />
          <StatCard label="Completed" value={stats.completed.value} delta={stats.completed.delta} trend={stats.completed.trend} color="var(--success)" href={tasksLink('status=done&sort=updatedAt')} />
        </div>
      ) : null}
      {overview ? <div className="flex-1">{overview}</div> : null}
    </div>
  )
}

/** "Assign to me" beside "My attendance", streamed in. */
async function BottomRow({ ctx, sp, tab, month, day, today, hours, data, newTask, personalMode, assignedP, attendanceP }: {
  ctx: Ctx
  sp: SearchParams
  tab: HomeTab
  month: string
  day: string
  today: string
  hours: Awaited<ReturnType<typeof workdayData>>['hours']
  data: TaskData | null
  newTask: ReactNode
  personalMode: boolean
  assignedP: Promise<Awaited<ReturnType<typeof assignedToMe>> | null>
  attendanceP: ReturnType<typeof attendanceMonth>
}) {
  const [assigned, attendance] = await Promise.all([assignedP, attendanceP])
  const showAttendance = Boolean(ctx.member.employeeId) || attendance.rows.length > 0
  const attendanceCard = showAttendance ? (
    <AttendanceCard month={month} today={today} selected={day} summary={attendance.summary} rows={attendance.rows} hours={hours} breaks={mergeBreakPolicies(ctx.org.breakTypes)} sp={sp} fullHref={ctx.member.employeeId ? '/app/me/attendance' : undefined} locale={localeOfUser(ctx.user)} />
  ) : ctx.has('muster') ? (
    <section className="card-solid flex h-full flex-col rounded-[10px] px-[23px] py-[18px]">
      <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.04em] text-white">
        <ListChecks className="size-4" strokeWidth={1.5} />
        My attendance
      </h2>
      <p className="mt-auto pb-4 text-sm text-fg-2">Attendance isn&apos;t set up for you yet. Check in from the side panel, or ask HR to link your employee record.</p>
    </section>
  ) : null
  const assignedCard = assigned && data ? <AssignedTable tab={tab} rows={assigned.rows} counts={assigned.counts} people={data.people} today={today} sp={sp} newTask={newTask} quickAdd={data.canWrite ? { personal: personalMode } : undefined} /> : null
  if (!assignedCard && !attendanceCard) return null
  return (
    <div className={cn('mt-[5px] grid grid-cols-1 gap-3', assignedCard && attendanceCard && '@min-[1000px]:grid-cols-[732fr_543fr] @min-[1000px]:gap-[15px]')}>
      {assignedCard}
      {attendanceCard}
    </div>
  )
}
