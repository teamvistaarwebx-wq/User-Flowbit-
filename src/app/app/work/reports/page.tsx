import type { Metadata } from 'next'
import { ChartColumn } from 'lucide-react'
import { breadcrumbFor } from '@/lib/catalog'
import { requireMember } from '@/lib/ctx'
import { formatDate, todayIST } from '@/lib/dates'
import { buildHref, first, type SearchParams } from '@/lib/list'
import { PageHeader } from '@/components/ui/page-header'
import { ReportSectionHost } from '@/components/work/reports/section-host'
import { ReportFilters } from '@/components/work/reports/report-filters'
import { PillLinks } from '@/components/work/teams/pill-links'
import { Project } from '@/models/work/Project'
import { Team } from '@/models/work/Team'
import { resolveRange } from '@/modules/work/reports/range'
import { validId } from '@/modules/work/reports/scope'
import { REPORT_SECTIONS, SECTION_LABELS, isSection } from '@/modules/work/reports/sections'
import { listPeople } from '@/modules/work/teams/people'

export const metadata: Metadata = { title: 'Work reports' }
const BASE = '/app/work/reports'

export default async function WorkReportsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  const ctx = await requireMember({ product: 'work', perm: 'work.reports' })
  const section = isSection(first(sp.section)) ? (first(sp.section) as (typeof REPORT_SECTIONS)[number]) : 'throughput'
  const range = resolveRange({ range: first(sp.range), from: first(sp.from), to: first(sp.to) }, todayIST())
  const scope = { projectId: validId(first(sp.project)), teamId: validId(first(sp.team)), assigneeId: validId(first(sp.assignee)) }
  const approvedOnly = first(sp.approved) === '1'
  const [projects, teams, people] = await Promise.all([
    ctx.db(Project).find({ archivedAt: null }, { name: 1, code: 1 }).sort({ name: 1 }).lean(),
    ctx.db(Team).find({}, { name: 1 }).sort({ name: 1 }).lean(),
    listPeople(ctx),
  ])

  return (
    <>
      <PageHeader title="Work reports" description={`Throughput, overdue work, people, project health and time · ${formatDate(range.from)} – ${formatDate(range.to)}`} breadcrumb={breadcrumbFor(BASE)} icon={<ChartColumn />}>
        <PillLinks active={section} items={REPORT_SECTIONS.map((s) => ({ key: s, label: SECTION_LABELS[s], href: buildHref(BASE, sp, { section: s === 'throughput' ? undefined : s }) }))} />
      </PageHeader>
      <div className="space-y-4">
        <ReportFilters
          base={BASE}
          sp={sp}
          range={range}
          section={section}
          scope={scope}
          projects={projects.map((p) => ({ value: String(p._id), label: `${p.code} · ${p.name}` }))}
          teams={teams.map((t) => ({ value: String(t._id), label: t.name }))}
          people={people.map((p) => ({ value: p.id, label: p.name }))}
        />
        {section === 'overdue' ? <p className="text-[13px] text-fg-2">Overdue is a snapshot of today; the date range does not apply.</p> : null}
        <ReportSectionHost ctx={ctx} section={section} range={range} scope={scope} approvedOnly={approvedOnly} approvedHref={buildHref(BASE, sp, { approved: approvedOnly ? undefined : '1' })} />
      </div>
    </>
  )
}
