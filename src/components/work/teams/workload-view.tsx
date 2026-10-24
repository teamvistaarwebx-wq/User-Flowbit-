import Link from 'next/link'
import { formatDuration } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { EmptyState } from '@/components/ui/empty-state'
import type { WorkloadRow } from '@/modules/work/teams/queries'
import { loadTone } from '@/modules/work/teams/workload'
import { Gauge, UserRound } from 'lucide-react'
import { HEAD_ROW, PanelHeader, rowClass, Th } from '../shared/table'

const TONE_FILL = { success: '#08AD93', warning: '#E4BD6D', danger: '#FF4540' } as const
const TONE_WORD = { success: 'text-[#2DCBAF]', warning: 'text-warning', danger: 'text-[#FF6A66]' } as const

/**
 * Load as one 16px bar (thick, like the dashboard's bars): the solid fill is time logged against capacity, the
 * translucent layer behind it is the open estimate (planned). Green under the plan, amber near it, red over it.
 */
export function LoadBar({ logged, planned, label, className }: { logged: number; planned?: number; label?: string; className?: string }) {
  const tone = loadTone(logged) as keyof typeof TONE_FILL
  const fill = TONE_FILL[tone] ?? '#5A585B'
  return (
    <div className={className ?? 'min-w-[170px]'}>
      <div className="mb-1.5 flex items-baseline justify-between gap-3 text-xs">
        <span className={cn('font-semibold tabular-nums', logged === 0 ? 'text-[#979797]' : (TONE_WORD[tone] ?? 'text-white'))}>{logged}% {label ?? 'logged'}</span>
        {planned !== undefined ? <span className="tabular-nums text-[#979797]">{planned}% planned</span> : null}
      </div>
      <div className="relative h-4 overflow-hidden rounded-full bg-white/[0.12]" role="progressbar" aria-label={`Logged${planned !== undefined ? `, ${planned}% planned` : ''}`} aria-valuenow={logged} aria-valuemin={0} aria-valuemax={100}>
        {planned ? <div className="absolute inset-y-0 left-0 rounded-full bg-white/[0.16]" style={{ width: `${Math.min(100, planned)}%` }} /> : null}
        <div className="relative h-full rounded-full transition-[width] duration-[600ms] ease-out" style={{ width: `${Math.min(100, logged)}%`, background: fill }} />
      </div>
    </div>
  )
}

/** Per-member workload, as Home's "Assign to me" table: ruled header with icons, plain rows, a totals row. */
export function WorkloadView({ rows }: { rows: WorkloadRow[] }) {
  if (!rows.length) return <div className="card-solid"><EmptyState icon={<Gauge />} title="No members yet" description="Add people to see their workload." /></div>
  const sum = (k: keyof WorkloadRow) => rows.reduce((s, r) => s + (r[k] as number), 0)
  const capacity = sum('capacity')
  const cell = 'px-3 py-3 text-right text-[13px] tabular-nums text-white'
  return (
    <section aria-label="Workload" className="card-table overflow-hidden">
      <PanelHeader icon={<Gauge />} title="Workload" subtitle="Open work, deadlines and time logged against each person's capacity" className="px-[23px] pb-4 pt-[17px]" />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] border-collapse">
          <thead>
            <tr className={HEAD_ROW}>
              <Th icon={<UserRound />} className="pl-[23px]">Member</Th>
              <Th align="right">Open</Th>
              <Th align="right">Overdue</Th>
              <Th align="right">Due in period</Th>
              <Th align="right">Blocked</Th>
              <Th align="right">Completed</Th>
              <Th align="right">Estimate open</Th>
              <Th align="right">Logged</Th>
              <Th icon={<Gauge />} className="pr-[23px]">Load</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={rowClass()}>
                <td className="py-3 pl-[23px] pr-3">
                  <Link href={`/app/work/tasks?assignee=${r.id}`} className="text-sm font-medium text-white transition-colors hover:text-blush">{r.name}</Link>
                </td>
                <td className={cell}>{r.open}</td>
                <td className={cn(cell, r.overdue && 'text-[#FF2D31]')}>{r.overdue}</td>
                <td className={cell}>{r.dueInPeriod}</td>
                <td className={cn(cell, r.blocked && 'text-pink')}>{r.blocked}</td>
                <td className={cn(cell, r.completed && 'text-[#2DCBAF]')}>{r.completed}</td>
                <td className={cn(cell, 'text-[#979797]')}>{formatDuration(r.estimateOpen)}</td>
                <td className={cn(cell, 'text-[#979797]')}>{formatDuration(r.logged)}</td>
                <td className="py-3 pl-3 pr-[23px]">
                  <LoadBar logged={r.load} planned={r.planned} />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-line font-semibold">
              <td className="py-3 pl-[23px] pr-3 text-[13px] font-semibold uppercase tracking-[0.04em] text-white">Team</td>
              <td className={cell}>{sum('open')}</td>
              <td className={cell}>{sum('overdue')}</td>
              <td className={cell}>{sum('dueInPeriod')}</td>
              <td className={cell}>{sum('blocked')}</td>
              <td className={cell}>{sum('completed')}</td>
              <td className={cell}>{formatDuration(sum('estimateOpen'))}</td>
              <td className={cell}>{formatDuration(sum('logged'))}</td>
              <td className="py-3 pl-3 pr-[23px]">
                <LoadBar logged={capacity ? Math.round((sum('logged') / capacity) * 100) : 0} label={`of ${formatDuration(capacity)}`} />
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  )
}
