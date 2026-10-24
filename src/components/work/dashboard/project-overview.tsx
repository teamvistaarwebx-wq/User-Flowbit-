import Link from 'next/link'
import type { ReactNode } from 'react'
import { CalendarDays, Component, Loader, UsersRound } from 'lucide-react'
import { formatDate } from '@/lib/dates'
import { RingChart } from '@/components/charts/ring-chart'
import { AvatarStack } from '@/components/ui/avatar'
import { StatusPill } from '@/components/ui/badge'
import { buttonClass } from '@/components/ui/button-styles'
import { EmptyState } from '@/components/ui/empty-state'
import { Swatch } from '@/components/ui/swatch'
import { PROJECT_STATUS_LABEL, type ProjectStatus } from '@/modules/work/projects/constants'
import { ringShares, type ProjectCounts } from '@/modules/work/projects/health'
import type { ProjectSummary } from '@/modules/work/projects/queries'
import type { Person } from '../tasks/types'
import { ProjectSwitcher } from './project-switcher'

const RING_COLORS = { done: 'var(--orange)', inProgress: 'var(--info)', blocked: 'var(--pink)' }

function Shell({ header, children }: { header: ReactNode; children: ReactNode }) {
  return (
    <section className="glass lit-edge-bright @container flex h-full flex-col rounded-[14px] bg-white/[0.11] px-[15px] pb-5 pt-[17px]">
      {header}
      {children}
    </section>
  )
}

function Title({ children }: { children: ReactNode }) {
  return (
    <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.04em] text-white">
      <Component className="size-4" strokeWidth={1.5} />
      {children}
    </h2>
  )
}

/** Legend from the Figma: a 12px rounded-square key, the label, and the share in 24/600 under it. */
function Legend({ counts }: { counts: ProjectCounts }) {
  const s = ringShares(counts)
  const rows = [
    { label: 'Project Done', value: s.done, color: RING_COLORS.done },
    { label: 'In Progress', value: s.inProgress, color: RING_COLORS.inProgress },
    { label: 'Blocked', value: s.blocked, color: RING_COLORS.blocked },
  ]
  return (
    <ul className="flex flex-col gap-[19px]">
      {rows.map((r) => (
        <li key={r.label}>
          <span className="flex items-center gap-[9px] text-sm text-white">
            <Swatch color={r.color} />
            {r.label}
          </span>
          <span className="mt-0.5 block pl-[21px] text-2xl font-semibold leading-7 tabular-nums text-white">{r.value}%</span>
        </li>
      ))}
    </ul>
  )
}

function Ring({ counts, size }: { counts: ProjectCounts; size: number }) {
  const s = ringShares(counts)
  return (
    <RingChart
      size={size}
      thickness={size >= 180 ? 14 : 12}
      gap={size >= 180 ? 12 : 9}
      rings={[{ label: 'Done', value: s.done, color: RING_COLORS.done }, { label: 'In progress', value: s.inProgress, color: RING_COLORS.inProgress }, { label: 'Blocked', value: s.blocked, color: RING_COLORS.blocked }]}
      centerValue={String(counts.total)}
      centerLabel="Tasks"
    />
  )
}

function Fact({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-8 items-center justify-between gap-3">
      <span className="flex items-center gap-2 text-sm text-white [&_svg]:size-4 [&_svg]:shrink-0">
        {icon}
        {label}
      </span>
      <span className="min-w-0 text-right">{children}</span>
    </div>
  )
}

/**
 * Home "Project overview" (Figma): title, the project dropdown pill and "View all projects"; then the legend,
 * the three concentric rings, a hairline divider, and the project's facts with right-aligned values.
 */
export function ProjectOverview({ projects, selected, people, canCreate, description }: { projects: ProjectSummary[]; selected: ProjectSummary | null; people: Person[]; canCreate: boolean; /** The selected project's description (the summary has none). */ description?: string | null }) {
  const byId = new Map(people.map((p) => [p.id, p]))
  if (!selected) {
    return (
      <Shell header={<Title>Project overview</Title>}>
        <EmptyState compact icon={<Component />} title="No projects yet" description="Projects group tasks, milestones and files." action={canCreate ? <Link href="/app/work/projects?new=1" className={buttonClass('primary', 'sm')}>Create project</Link> : undefined} />
      </Shell>
    )
  }
  const dates = selected.endDate ? formatDate(selected.endDate) : selected.startDate ? `From ${formatDate(selected.startDate)}` : 'No dates'
  return (
    <Shell
      header={
        <div className="flex items-center gap-3">
          <Title>Project overview</Title>
          <ProjectSwitcher projects={projects.map((p) => ({ id: p.id, name: p.name }))} value={selected.id} className="h-[22px] w-auto min-w-[124px] max-w-[180px] gap-1.5 border-0 bg-control px-2.5 text-xs font-medium hover:bg-[#1f1f1f] [&_svg]:size-3.5" />
          <Link href="/app/work/projects" className="ml-auto shrink-0 text-xs font-medium text-white transition-opacity hover:opacity-75">
            View all projects
          </Link>
        </div>
      }
    >
      <div className="mt-[26px] grid flex-1 grid-cols-[auto_auto] items-center justify-around gap-x-6 gap-y-5 @min-[640px]:grid-cols-[124px_auto_1px_minmax(0,1fr)] @min-[640px]:justify-normal @min-[640px]:gap-x-[19px]">
        <Legend counts={selected.counts} />
        <div className="justify-self-center @min-[640px]:-ml-1">
          <span className="hidden @min-[700px]:block">
            <Ring counts={selected.counts} size={186} />
          </span>
          <span className="block @min-[700px]:hidden">
            <Ring counts={selected.counts} size={148} />
          </span>
        </div>
        <span aria-hidden className="hidden h-[193px] w-px self-center bg-line-soft @min-[640px]:block" />
        <div className="col-span-2 min-w-0 @min-[640px]:col-span-1 @min-[640px]:self-start">
          <Link href={`/app/work/projects/${selected.id}`} className="block truncate text-lg font-semibold leading-6 text-white transition-opacity hover:opacity-80">
            {selected.name}
          </Link>
          <p className="mt-1 line-clamp-2 text-xs leading-[15px] text-white">{description || [selected.code, selected.clientName].filter(Boolean).join(' · ') || 'No description yet.'}</p>
          <div className="mt-[26px] space-y-[3px]">
            <Fact icon={<Loader strokeWidth={1.5} />} label="Status">
              <StatusPill status={selected.status} tone={selected.status === 'active' ? 'info' : undefined} label={PROJECT_STATUS_LABEL[selected.status as ProjectStatus]} className="min-w-[82px] justify-center" />
            </Fact>
            <Fact icon={<UsersRound strokeWidth={1.5} />} label="Assignees">
              <AvatarStack size="xs" max={4} people={selected.memberIds.map((id) => ({ name: byId.get(id)?.name, src: byId.get(id)?.avatarUrl }))} className="justify-end" />
            </Fact>
            <Fact icon={<CalendarDays strokeWidth={1.5} />} label="Timeline">
              <span className="text-sm tabular-nums text-white">{dates}</span>
            </Fact>
          </div>
        </div>
      </div>
    </Shell>
  )
}

/** Personal workspaces have no projects: the same card over my own tasks. */
export function MyTasksOverview({ counts }: { counts: ProjectCounts }) {
  return (
    <Shell
      header={
        <div className="flex items-center gap-3">
          <Title>My tasks overview</Title>
          <Link href="/app/work/tasks?personal=1" className="ml-auto text-xs font-medium text-white transition-opacity hover:opacity-75">
            Open tasks
          </Link>
        </div>
      }
    >
      <div className="mt-[26px] grid flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-6">
        <Legend counts={counts} />
        <Ring counts={counts} size={148} />
      </div>
    </Shell>
  )
}
