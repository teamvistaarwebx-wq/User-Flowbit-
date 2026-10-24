import Link from 'next/link'
import { Clock, Component, Gauge, HeartPulse, Loader, UserRound } from 'lucide-react'
import { BarChart } from '@/components/charts'
import { StatusPill } from '@/components/ui/badge'
import { Card, CardHeader } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { StatCard } from '@/components/ui/stat-card'
import { formatDuration } from '@/lib/dates'
import { cn } from '@/lib/utils'
import type { projectHealthReport } from '@/modules/work/reports/task-reports'
import type { timeReport } from '@/modules/work/reports/time-report'
import { HEAD_ROW, PanelHeader, rowClass, Th } from '../shared/table'
import { NoData } from './no-data'

type Projects = Awaited<ReturnType<typeof projectHealthReport>>
type Time = Awaited<ReturnType<typeof timeReport>>
const td = 'px-3 py-2.5 text-[13px] text-white/85'
/** Series colours from the Figma's data set; red is left out because red means overdue everywhere else. */
const PALETTE = ['#6160FF', '#08AD93', '#E68763', '#FAB5E8', '#E4BD6D', '#CA81B8', '#70F3C3', '#9A80CC']

export function ProjectSection({ data }: { data: Projects }) {
  if (!data.length) return <NoData title="No active projects" description="Projects you create in Work show up here with their health." />
  return (
    <section aria-label="Project health" className="card-table overflow-hidden">
      <PanelHeader icon={<HeartPulse />} title="Project health" subtitle="Completion against the calendar for every active project" className="px-[23px] pb-4 pt-[17px]" />
      <div className="overflow-x-auto">
      <table className="w-full min-w-[980px] border-collapse">
        <thead><tr className={HEAD_ROW}><Th icon={<Component />} className="pl-[23px]">Project</Th><Th icon={<UserRound />}>Lead</Th><Th icon={<Loader />}>Status</Th><Th icon={<Gauge />}>Health</Th><Th>Completion</Th><Th align="right">Open</Th><Th align="right">Overdue</Th><Th align="right">Blocked</Th><Th>Schedule</Th><Th align="right" className="pr-[23px]">Logged</Th></tr></thead>
        <tbody>
          {data.map((p) => (
            <tr key={p.id} className={rowClass()}>
              <td className={cn(td, 'pl-[23px]')}>{p.canOpen ? <Link href={`/app/work/projects/${p.id}`} className="text-sm text-white transition-colors hover:text-blush"><span className="tabular-nums text-[#797779]">{p.code}</span> {p.name}</Link> : <span className="text-sm text-white"><span className="tabular-nums text-[#797779]">{p.code}</span> {p.name}</span>}</td>
              <td className={td}>{p.lead}</td>
              <td className={td}><StatusPill status={p.status} /></td>
              <td className={td}><StatusPill status={p.health} label={p.score === null ? undefined : `${p.health === 'on_track' ? 'On track' : p.health === 'at_risk' ? 'At risk' : 'Off track'} · ${p.score}`} /></td>
              <td className={cn(td, 'w-44')}><Progress value={p.completion} label="Done" /></td>
              <td className={cn(td, 'text-right tabular-nums')}>{p.open}</td>
              <td className={cn(td, 'text-right tabular-nums', p.overdue && 'text-[#FF2D31]')}>{p.overdue}</td>
              <td className={cn(td, 'text-right tabular-nums', p.blocked && 'text-pink')}>{p.blocked}</td>
              <td className={td}>
                {p.gap === null ? '—' : <span className={p.gap >= 0 ? 'text-[#2DCBAF]' : 'text-warning'}>{p.gap >= 0 ? `Ahead by ${p.gap} pts` : `Behind by ${-p.gap} pts`}</span>}
                {p.daysLeft !== null ? <span className="block text-xs text-[#979797]">{p.daysLeft >= 0 ? `${p.daysLeft} days left` : `${-p.daysLeft} days over`}</span> : null}
              </td>
              <td className={cn(td, 'pr-[23px] text-right tabular-nums')}>{formatDuration(p.loggedMinutes)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </section>
  )
}

export function TimeSection({ data, approvedHref, approvedOnly }: { data: Time; approvedHref: string; approvedOnly: boolean }) {
  const toggle = <Link href={approvedHref} className="text-xs font-medium text-white transition-opacity hover:opacity-75">{approvedOnly ? 'Show all non-rejected time' : 'Only approved time'}</Link>
  if (!data.rows.length) return <NoData description={approvedOnly ? 'No approved time in this period. Switch to all time to include drafts and submitted weeks.' : undefined} />
  const top = data.memberNames.slice(0, PALETTE.length)
  return (
    <div className="space-y-3">
      {data.truncated ? <p role="status" className="text-[13px] text-warning">This range has more time entries than one report can show, so the totals below are cut short. Pick a shorter range or one project.</p> : null}
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Total" value={formatDuration(data.totals.billable + data.totals.nonBillable)} icon={<Clock />} />
        <StatCard label="Billable" value={formatDuration(data.totals.billable)} icon={<Clock />} color="var(--success)" />
        <StatCard label="Non-billable" value={formatDuration(data.totals.nonBillable)} icon={<Clock />} />
      </div>
      <Card variant="solid">
        <CardHeader label="Hours by project and member" icon={<HeartPulse />} actions={toggle} />
        <BarChart horizontal stacked labels={data.rows.map((r) => r.project)} series={top.map((name, i) => ({ name, color: PALETTE[i], data: data.rows.map((r) => Math.round(((r.members.find((m) => m.name === name)?.minutes ?? 0) / 60) * 10) / 10) }))} height={Math.max(200, data.rows.length * 38)} formatValue={(v) => `${Math.round(v * 10) / 10}h`} />
      </Card>
      <section aria-label="Time by project" className="card-table overflow-hidden">
        <PanelHeader icon={<Clock />} title="Time by project" subtitle="Billable and non-billable hours, with the people who logged most" className="px-[23px] pb-4 pt-[17px]" />
        <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse">
          <thead><tr className={HEAD_ROW}><Th icon={<Component />} className="pl-[23px]">Project</Th><Th align="right">Billable</Th><Th align="right">Non-billable</Th><Th align="right">Total</Th><Th icon={<UserRound />} className="pr-[23px]">Top people</Th></tr></thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={r.project} className={cn(rowClass(), 'text-right tabular-nums')}>
                <td className={cn(td, 'pl-[23px] text-left text-sm text-white')}>{r.project}</td>
                <td className={cn(td, 'text-[#2DCBAF]')}>{formatDuration(r.billable)}</td>
                <td className={td}>{formatDuration(r.nonBillable)}</td>
                <td className={cn(td, 'font-semibold text-white')}>{formatDuration(r.total)}</td>
                <td className={cn(td, 'pr-[23px] text-left text-xs text-[#979797]')}>{r.members.slice(0, 3).map((m) => `${m.name} ${formatDuration(m.minutes)}`).join(' · ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </section>
    </div>
  )
}
