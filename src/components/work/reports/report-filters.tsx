import Link from 'next/link'
import { Download, Filter } from 'lucide-react'
import { buildHref, type SearchParams } from '@/lib/list'
import { buttonClass } from '@/components/ui/button-styles'
import { DateInput, NativeSelect } from '@/components/ui/input'
import { PillLinks } from '../teams/pill-links'
import { PRESET_LABELS, RANGE_PRESETS, type DateRange } from '@/modules/work/reports/range'
import type { ReportSection } from '@/modules/work/reports/sections'

type Option = { value: string; label: string }
type Props = { base: string; sp: SearchParams; range: DateRange; section: ReportSection; projects: Option[]; teams: Option[]; people: Option[]; scope: { projectId?: string; teamId?: string; assigneeId?: string } }

/** Range presets, custom dates and scope filters (plain GET forms, no client JS), on the opaque form surface. */
export function ReportFilters({ base, sp, range, section, projects, teams, people, scope }: Props) {
  const keep = (names: string[]) => names.map((n) => (typeof sp[n] === 'string' ? <input key={n} type="hidden" name={n} value={sp[n] as string} /> : null))
  const csvQuery = buildHref(`/api/work/reports/${section}`, sp, { section: undefined, page: undefined })
  return (
    <div className="card-solid space-y-4 rounded-[10px] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PillLinks active={range.preset} items={RANGE_PRESETS.filter((r) => r !== 'custom').map((r) => ({ key: r, label: PRESET_LABELS[r], href: buildHref(base, sp, { range: r === 'this_month' ? undefined : r, from: undefined, to: undefined }) }))} />
        <form action={base} className="flex flex-wrap items-center gap-2">
          {keep(['section', 'project', 'team', 'assignee', 'approved'])}
          <input type="hidden" name="range" value="custom" />
          <DateInput name="from" defaultValue={range.from} inputSize="sm" aria-label="From" className="w-40" />
          <span className="text-[13px] text-fg-2">to</span>
          <DateInput name="to" defaultValue={range.to} inputSize="sm" aria-label="To" className="w-40" />
          <button type="submit" className={buttonClass(range.preset === 'custom' ? 'violet' : 'secondary', 'sm')}>Apply dates</button>
        </form>
      </div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <form action={base} className="flex flex-wrap items-center gap-2">
          {keep(['section', 'range', 'from', 'to', 'approved'])}
          <NativeSelect name="project" options={projects} placeholder="All projects" defaultValue={scope.projectId ?? ''} className="h-8 w-48 text-[13px]" aria-label="Project" />
          <NativeSelect name="team" options={teams} placeholder="All teams" defaultValue={scope.teamId ?? ''} className="h-8 w-40 text-[13px]" aria-label="Team" />
          <NativeSelect name="assignee" options={people} placeholder="Everyone" defaultValue={scope.assigneeId ?? ''} className="h-8 w-44 text-[13px]" aria-label="Assignee" />
          <button type="submit" className={buttonClass('secondary', 'sm')}>
            <Filter className="size-3.5" /> Filter
          </button>
          {scope.projectId || scope.teamId || scope.assigneeId ? (
            <Link href={buildHref(base, sp, { project: undefined, team: undefined, assignee: undefined })} className="text-[13px] text-fg-2 transition-colors hover:text-white">
              Reset filters
            </Link>
          ) : null}
        </form>
        <a href={csvQuery} className={buttonClass('secondary', 'sm')} download>
          <Download className="size-3.5" /> Export CSV
        </a>
      </div>
    </div>
  )
}
