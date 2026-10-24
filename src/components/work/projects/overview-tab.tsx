import Link from 'next/link'
import type { ReactNode } from 'react'
import { CalendarDays, CalendarRange, CircleAlert, Component, Crown, Flag, Gauge, ListChecks, Loader, Text, Users, UsersRound } from 'lucide-react'
import { formatDate, todayIST } from '@/lib/dates'
import type { Tone } from '@/lib/status'
import { cn } from '@/lib/utils'
import { RingChart } from '@/components/charts/ring-chart'
import { AvatarStack } from '@/components/ui/avatar'
import { StatusPill } from '@/components/ui/badge'
import { Card, CardHeader } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { StatCard } from '@/components/ui/stat-card'
import { Swatch } from '@/components/ui/swatch'
import { HEALTH_LABEL, PROJECT_STATUS_LABEL, type ProjectHealth, type ProjectStatus } from '@/modules/work/projects/constants'
import type { MilestoneRow } from '@/modules/work/projects/detail'
import { healthDrivers, ringShares, timelineSummary } from '@/modules/work/projects/health'
import type { ProjectSummary } from '@/modules/work/projects/queries'
import { PanelHeader } from '../shared/table'
import type { Person } from '../tasks/types'
import { HealthPill } from './project-card'
import { ProjectMembers } from './project-members'

const HEALTH_TONE: Record<ProjectHealth, Tone> = { on_track: 'success', at_risk: 'warning', off_track: 'danger' }
const RING = { done: 'var(--orange)', inProgress: 'var(--info)', blocked: 'var(--pink)' }

export type OverviewTabProps = {
  project: ProjectSummary
  description: string | null
  milestones: MilestoneRow[]
  people: Person[]
  workload: { _id: unknown; total: number; completed: number; inProgress: number }[]
  canEdit: boolean
}

/** A fact row from Home's Project overview: icon + label on the left, the value right-aligned. */
function Fact({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-[34px] items-center justify-between gap-3">
      <span className="flex items-center gap-2 text-sm text-white [&_svg]:size-4 [&_svg]:shrink-0">
        {icon}
        {label}
      </span>
      <span className="min-w-0 text-right">{children}</span>
    </div>
  )
}

function Ring({ project, size }: { project: ProjectSummary; size: number }) {
  const s = ringShares(project.counts)
  return (
    <RingChart
      size={size}
      thickness={size >= 180 ? 14 : 12}
      gap={size >= 180 ? 12 : 9}
      rings={[{ label: 'Done', value: s.done, color: RING.done }, { label: 'In progress', value: s.inProgress, color: RING.inProgress }, { label: 'Blocked', value: s.blocked, color: RING.blocked }]}
      centerValue={`${project.progress}%`}
      centerLabel="Done"
    />
  )
}

/**
 * The project's Overview, built from Home's parts: a Project overview glass card (legend, concentric rings, a
 * hairline, facts), the stat cards, a thick timeline bar like the workday timeline, then opaque cards for
 * health, the breakdown, milestones, people and the description.
 */
export function OverviewTab({ project, description, milestones, people, workload, canEdit }: OverviewTabProps) {
  const today = todayIST()
  const c = project.counts
  const shares = ringShares(c)
  const timeline = timelineSummary(project, today)
  const next = milestones.filter((m) => m.status === 'open').slice(0, 3)
  const loads = Object.fromEntries(workload.map((w) => [String(w._id), { total: w.total, completed: w.completed }]))
  const pct = (n: number) => (c.total ? (n / c.total) * 100 : 0)
  const byId = new Map(people.map((p) => [p.id, p]))
  const lead = byId.get(project.leadId)
  const health = project.health as ProjectHealth
  const dates = project.startDate && project.endDate ? `${formatDate(project.startDate)} – ${formatDate(project.endDate)}` : project.endDate ? `Due ${formatDate(project.endDate)}` : project.startDate ? `From ${formatDate(project.startDate)}` : 'No dates'
  const legend = [
    { label: 'Project Done', value: shares.done, color: RING.done },
    { label: 'In Progress', value: shares.inProgress, color: RING.inProgress },
    { label: 'Blocked', value: shares.blocked, color: RING.blocked },
  ]

  return (
    <div className="grid grid-cols-12 gap-3">
      <section className="glass lit-edge-bright @container col-span-12 rounded-[14px] bg-white/[0.11] px-[15px] pb-5 pt-[17px]">
        <PanelHeader icon={<Component />} title="Project overview" actions={<span className="text-xs font-medium tabular-nums text-white">{c.completed} of {c.total} tasks done</span>} />
        <div className="mt-[26px] grid grid-cols-[auto_auto] items-center justify-around gap-x-6 gap-y-6 @min-[700px]:grid-cols-[124px_auto_1px_minmax(0,1fr)] @min-[700px]:justify-normal @min-[700px]:gap-x-[19px]">
          <ul className="flex flex-col gap-[19px]">
            {legend.map((r) => (
              <li key={r.label}>
                <span className="flex items-center gap-[9px] text-sm text-white">
                  <Swatch color={r.color} />
                  {r.label}
                </span>
                <span className="mt-0.5 block pl-[21px] text-2xl font-semibold leading-7 tabular-nums text-white">{r.value}%</span>
              </li>
            ))}
          </ul>
          <div className="justify-self-center">
            <span className="hidden @min-[760px]:block"><Ring project={project} size={186} /></span>
            <span className="block @min-[760px]:hidden"><Ring project={project} size={148} /></span>
          </div>
          <span aria-hidden className="hidden h-[193px] w-px self-center bg-line-soft @min-[700px]:block" />
          <div className="col-span-2 min-w-0 @min-[700px]:col-span-1 @min-[700px]:self-start">
            <p className="truncate text-lg font-semibold leading-6 text-white">{project.name}</p>
            <p className="mt-1 line-clamp-2 text-xs leading-[15px] text-white">{description || (project.clientName ? `Client work for ${project.clientName}.` : 'Internal project.')}</p>
            <div className="mt-[22px] space-y-[3px]">
              <Fact icon={<Loader />} label="Status">
                <StatusPill status={project.status} tone={project.status === 'active' ? 'info' : undefined} label={PROJECT_STATUS_LABEL[project.status as ProjectStatus]} className="min-w-[82px] justify-center" />
              </Fact>
              <Fact icon={<Gauge />} label="Health">
                <HealthPill health={project.health} />
              </Fact>
              <Fact icon={<Crown />} label="Lead">
                <span className="text-sm text-white">{lead?.name ?? 'Former member'}</span>
              </Fact>
              <Fact icon={<UsersRound />} label="Assignees">
                <AvatarStack size="xs" max={4} people={project.memberIds.map((id) => ({ name: byId.get(id)?.name, src: byId.get(id)?.avatarUrl }))} className="justify-end" />
              </Fact>
              <Fact icon={<CalendarDays />} label="Timeline">
                <span className="text-sm tabular-nums text-white">{dates}</span>
              </Fact>
            </div>
          </div>
        </div>
      </section>

      <div className="col-span-12 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total" value={c.total} />
        <StatCard label="Completed" value={c.completed} color="var(--success)" />
        <StatCard label="In progress" value={c.inProgress} color="var(--info)" />
        <StatCard label="Overdue" value={c.overdue} color="var(--danger)" hint={c.blocked ? `${c.blocked} blocked` : undefined} />
      </div>

      {/* Timeline as Home's workday bar: a 42px track, the time used filled with the workday gradient. */}
      <section className="glass col-span-12 rounded-[16px] bg-white/[0.05] px-[17px] pb-4 pt-[15px] lg:col-span-7">
        <PanelHeader icon={<CalendarRange />} title="Timeline" subtitle={timeline ? `${timeline.label} · ${timeline.elapsed}% of the time used, ${project.progress}% of the work done` : undefined} />
        {project.startDate && project.endDate && timeline ? (
          <div className="mt-4">
            <div className="relative h-[42px] overflow-hidden rounded-[8px] bg-white/[0.17]" role="progressbar" aria-label="Time used" aria-valuenow={timeline.elapsed} aria-valuemin={0} aria-valuemax={100}>
              <div className="relative h-full overflow-hidden rounded-[8px] bg-grad-progress transition-[width] duration-[600ms] ease-out" style={{ width: `${Math.min(100, Math.max(0, timeline.elapsed))}%` }}>
                {timeline.elapsed > 0 ? <span aria-hidden className="absolute inset-y-0 left-0 w-[120px] animate-[sheen_7s_var(--ease-in-out)_infinite] bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.14),transparent)]" /> : null}
              </div>
              {/* The fill starts near-white, so the start date takes plum ink once it sits on the fill. */}
              <span className={`absolute inset-y-0 left-3 flex items-center text-sm font-medium tabular-nums ${timeline.elapsed > 8 ? 'text-[#3B2766]' : 'text-white'}`}>{formatDate(project.startDate, { short: true })}</span>
              <span className="absolute inset-y-0 right-3 flex items-center text-sm font-medium tabular-nums text-white">{formatDate(project.endDate, { short: true })}</span>
            </div>
            <div className="mt-3">
              <Progress value={project.progress} label="Work done" />
            </div>
          </div>
        ) : (
          <p className="mt-4 text-[13px] text-fg-2">Add a start and end date in Settings to track the timeline.</p>
        )}
      </section>

      <Card variant="solid" className="col-span-12 lg:col-span-5">
        <CardHeader label="Health" icon={<Gauge />} actions={<HealthPill health={project.health} />} />
        <div className="flex items-end gap-2">
          <span className="text-2xl font-semibold leading-7 tabular-nums text-white">{project.healthScore}</span>
          <span className="pb-0.5 text-sm text-fg-2">/ 100 · {HEALTH_LABEL[health]}</span>
        </div>
        <Progress className="mt-3" value={project.healthScore} tone={HEALTH_TONE[health] ?? 'neutral'} />
        <ul className="mt-4 space-y-2 text-sm text-white/85">
          {healthDrivers(c, project, today).map((d) => <li key={d} className="flex items-center gap-2"><CircleAlert className="size-4 shrink-0 text-icon-muted" />{d}</li>)}
        </ul>
      </Card>

      <Card variant="solid" className="col-span-12 lg:col-span-6">
        <CardHeader label="Task progress breakdown" icon={<ListChecks />} description="Share of all tasks in this project" />
        <div className="space-y-4">
          <Progress value={pct(c.completed)} tone="success" label={`Completed · ${c.completed}/${c.total}`} />
          <Progress value={pct(c.overdue)} tone="danger" label={`Overdue · ${c.overdue}/${c.total}`} />
          <Progress value={pct(c.blocked)} tone="pink" label={`Blocked · ${c.blocked}/${c.total}`} />
        </div>
      </Card>
      <Card variant="solid" className="col-span-12 lg:col-span-6">
        <CardHeader label="Next milestones" icon={<Flag />} actions={<Link href={`/app/work/projects/${project.id}?tab=milestones`} className="text-xs font-medium text-white transition-opacity hover:opacity-75">All milestones</Link>} />
        {next.length === 0 ? <p className="text-[13px] text-fg-2">No open milestones.</p> : null}
        <ul className="-mx-2">
          {next.map((m) => (
            <li key={m.id} className="flex h-9 items-center gap-3 rounded-lg px-2 transition-colors hover:bg-white/[0.04]">
              <Flag className={cn('size-4 shrink-0', m.overdue ? 'text-[#FF4540]' : 'text-icon-muted')} />
              <span className="min-w-0 flex-1 truncate text-sm text-white">{m.title}</span>
              <span className={cn('text-[13px] tabular-nums', m.overdue ? 'text-[#FF2D31]' : 'text-[#979797]')}>{formatDate(m.dueDate)}</span>
            </li>
          ))}
        </ul>
      </Card>
      <Card variant="solid" className="col-span-12 lg:col-span-6">
        <CardHeader label="Members" icon={<Users />} />
        <ProjectMembers projectId={project.id} projectName={project.name} leadId={project.leadId} memberIds={project.memberIds} people={people} canEdit={canEdit} workload={loads} />
      </Card>
      <Card variant="solid" className="col-span-12 lg:col-span-6">
        <CardHeader label="About" icon={<Text />} />
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-white/85">{description || 'No description yet.'}</p>
        <p className="mt-3 text-[13px] text-[#959596]">{project.clientName ? `Client: ${project.clientName}` : 'Internal project'}</p>
      </Card>
    </div>
  )
}
