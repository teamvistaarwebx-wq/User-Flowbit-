import Link from 'next/link'
import { AlarmClock, AlignLeft, CalendarDays, ChartNoAxesColumn, Component, Gauge, ListChecks, TrendingUp, UserRound, UsersRound } from 'lucide-react'
import { BarChart, LineChart } from '@/components/charts'
import { PriorityLabel } from '@/components/ui/badge'
import { Card, CardHeader } from '@/components/ui/card'
import { StatCard } from '@/components/ui/stat-card'
import { formatDate, formatDuration } from '@/lib/dates'
import { cn } from '@/lib/utils'
import type { assigneeReport, overdueReport, throughputReport } from '@/modules/work/reports/task-reports'
import { HEAD_ROW, PanelHeader, rowClass, Th } from '../shared/table'
import { NoData } from './no-data'

type Throughput = Awaited<ReturnType<typeof throughputReport>>
type Overdue = Awaited<ReturnType<typeof overdueReport>>
type Assignees = Awaited<ReturnType<typeof assigneeReport>>

const td = 'px-3 py-2.5 text-[13px] text-white/85'

export function ThroughputSection({ data }: { data: Throughput }) {
  if (!data.totals.created && !data.totals.completed) return <NoData />
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Created" value={data.totals.created} icon={<TrendingUp />} trend={data.created} color="var(--info)" />
        <StatCard label="Completed" value={data.totals.completed} icon={<TrendingUp />} trend={data.completed} color="var(--success)" />
        <StatCard label="Avg cycle time" value={data.totals.cycleDays === null ? '—' : `${data.totals.cycleDays} d`} icon={<Gauge />} hint="From start (or creation) to done" />
      </div>
      <Card variant="solid">
        <CardHeader label="Created vs completed" icon={<TrendingUp />} description="Tasks per period in the selected range" />
        <LineChart labels={data.labels} series={[{ name: 'Created', color: 'var(--info)', data: data.created }, { name: 'Completed', color: 'var(--success)', data: data.completed }]} height={240} />
      </Card>
    </div>
  )
}

export function OverdueSection({ data }: { data: Overdue }) {
  if (!data.table.length) return <NoData title="Nothing is overdue" description="Every open task with a due date is on time." />
  return (
    <div className="grid grid-cols-12 gap-3">
      <Card variant="solid" className="col-span-12 lg:col-span-5">
        <CardHeader label="Aging" icon={<AlarmClock />} description={`${data.table.length} open tasks past their due date`} />
        <BarChart labels={data.aging.map((a) => a.label)} series={[{ name: 'Tasks', color: 'var(--danger)', data: data.aging.map((a) => a.count) }]} height={200} />
      </Card>
      <Card variant="solid" className="col-span-12 lg:col-span-7">
        <CardHeader label="By assignee and project" icon={<UserRound />} description="Where the overdue work sits" />
        <div className="grid gap-4 sm:grid-cols-2">
          {[{ title: 'Assignee', rows: data.byAssignee }, { title: 'Project', rows: data.byProject }].map((g) => (
            <ul key={g.title} className="space-y-0.5 text-[13px]">
              <li className="mb-2 text-xs font-semibold uppercase tracking-[0.06em] text-fg-2">{g.title}</li>
              {g.rows.slice(0, 8).map((r) => (
                <li key={r.label} className="flex h-7 items-center justify-between gap-2"><span className="truncate text-white/85">{r.label}</span><span className="font-semibold tabular-nums text-[#FF2D31]">{r.count}</span></li>
              ))}
            </ul>
          ))}
        </div>
      </Card>
      <section aria-label="Overdue tasks" className="card-table col-span-12 overflow-hidden">
        <PanelHeader icon={<ListChecks />} title="Overdue tasks" subtitle="Oldest first is the place to start" className="px-[23px] pb-4 pt-[17px]" />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse">
            <thead><tr className={HEAD_ROW}><Th icon={<AlignLeft />} className="pl-[23px]">Task</Th><Th icon={<Component />}>Project</Th><Th icon={<UsersRound />}>Assignees</Th><Th icon={<CalendarDays />}>Due</Th><Th align="right">Days over</Th><Th icon={<ChartNoAxesColumn />} className="pr-[23px]">Priority</Th></tr></thead>
            <tbody>
              {data.table.map((r) => (
                <tr key={r.id} className={rowClass()}>
                  <td className={cn(td, 'pl-[23px]')}><Link href={`/app/work/tasks/${r.id}`} className="text-sm text-white transition-colors hover:text-blush"><span className="tabular-nums text-[#797779]">{r.key}</span> {r.title}</Link></td>
                  <td className={td}>{r.project}</td>
                  <td className={td}>{r.assignees.join(', ')}</td>
                  <td className={cn(td, 'tabular-nums text-[#FF2D31]')}>{formatDate(r.dueDate)}</td>
                  <td className={cn(td, 'text-right font-semibold tabular-nums text-[#FF2D31]')}>{r.days}</td>
                  <td className={cn(td, 'pr-[23px]')}><PriorityLabel priority={r.priority} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

export function AssigneeSection({ data }: { data: Assignees }) {
  const active = data.filter((r) => r.open || r.completed || r.loggedMinutes)
  if (!active.length) return <NoData />
  return (
    <div className="space-y-3">
      <Card variant="solid">
        <CardHeader label="Open vs completed" icon={<UserRound />} description="Per person, in the selected range" />
        <BarChart horizontal labels={active.map((r) => r.name)} series={[{ name: 'Completed', color: 'var(--success)', data: active.map((r) => r.completed) }, { name: 'Open', color: 'var(--info)', data: active.map((r) => r.open) }, { name: 'Overdue', color: 'var(--danger)', data: active.map((r) => r.overdue) }]} height={Math.max(200, active.length * 34)} />
      </Card>
      <section aria-label="People" className="card-table overflow-hidden">
        <PanelHeader icon={<UsersRound />} title="People" subtitle="Delivery, timeliness and time logged per person" className="px-[23px] pb-4 pt-[17px]" />
        <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] border-collapse">
          <thead><tr className={HEAD_ROW}><Th icon={<UserRound />} className="pl-[23px]">Member</Th><Th align="right">Open</Th><Th align="right">Completed</Th><Th align="right">Overdue</Th><Th align="right">On time</Th><Th align="right">Avg cycle</Th><Th align="right">Logged</Th><Th align="right" className="pr-[23px]">Estimate variance</Th></tr></thead>
          <tbody>
            {active.map((r) => (
              <tr key={r.id} className={cn(rowClass(), 'text-right tabular-nums')}>
                <td className={cn(td, 'pl-[23px] text-left')}><Link href={`/app/work/tasks?assignee=${r.id}`} className="text-sm text-white transition-colors hover:text-blush">{r.name}</Link></td>
                <td className={td}>{r.open}</td>
                <td className={cn(td, r.completed && 'text-[#2DCBAF]')}>{r.completed}</td>
                <td className={cn(td, r.overdue && 'text-[#FF2D31]')}>{r.overdue}</td>
                <td className={td}>{r.onTime === null ? '—' : `${r.onTime}%`}</td>
                <td className={td}>{r.cycleDays === null ? '—' : `${r.cycleDays} d`}</td>
                <td className={td}>{formatDuration(r.loggedMinutes)}</td>
                <td className={cn(td, 'pr-[23px]', r.variance !== null && r.variance > 20 && 'text-warning')}>{r.variance === null ? '—' : `${r.variance > 0 ? '+' : ''}${r.variance}%`}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </section>
    </div>
  )
}
