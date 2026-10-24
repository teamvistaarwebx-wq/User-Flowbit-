import type { Metadata } from 'next'
import { Download } from 'lucide-react'
import { requireStaff } from '@/lib/console/session'
import { isoDateIST } from '@/lib/dates'
import { buildHref, first, type SearchParams } from '@/lib/list'
import { buttonClass } from '@/components/ui/button-styles'
import { PageHeader } from '@/components/ui/page-header'
import { FilterPills } from '@/components/settings/filter-pills'
import { buildReport, parseReportParams, PERIOD_LABEL, PERIODS, REPORT_SECTIONS, SECTION_LABEL, sectionsFor, type ReportSection } from '@/modules/console/reports/build'
import { MARKETING_GROUPS } from '@/modules/console/reports/funnel'
import { monthsEnding } from '@/modules/console/reports/money'
import { loadReportData } from '@/modules/console/reports/query'
import { FunnelSection, MarketingSection, MoneySection, TeamSection } from './sections'

export const metadata: Metadata = { title: 'Reports' }
export const maxDuration = 300

const MONTH_PICKS = 6
const monthLabel = (month: string) => new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' })

/** Console Reports (console spec 7.2): Admin sees all; Sales the funnel and its own numbers; Accounts the money. */
export default async function ConsoleReportsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const p = await requireStaff('reports.view')
  const sp = await searchParams
  const now = new Date()
  const { sections } = sectionsFor(p.staff.role)
  const asked = first(sp.section) as ReportSection | undefined
  const section: ReportSection = asked && sections.includes(asked) ? asked : sections[0]
  const params = parseReportParams({ period: first(sp.period), month: first(sp.month), group: first(sp.group) }, now)
  const ledgerSince = new Date(`${monthsEnding(params.month, 12)[0]}-01T00:00:00+05:30`)
  const data = await loadReportData(p, { ledgerSince })
  const report = buildReport(data, params, { role: p.staff.role, staffId: String(p.staff.id) }, now)
  const here = (patch: Record<string, string | undefined>) => buildHref('/console/reports', sp, patch)
  const csv = `/api/console/reports/${section}?${new URLSearchParams({ period: params.period, month: params.month, group: params.group }).toString()}`
  const months = monthsEnding(isoDateIST(now).slice(0, 7), MONTH_PICKS).reverse()

  return (
    <>
      <PageHeader
        title="Reports"
        description={`Internal and Test workspaces are left out of every number${data.excluded ? ` (${data.excluded} left out)` : ''}.`}
        actions={<a href={csv} className={buttonClass('secondary', 'sm')}><Download className="size-3.5" /> Export CSV</a>}
      >
        {sections.length > 1 ? <FilterPills label="Report sections" items={REPORT_SECTIONS.filter((s) => sections.includes(s)).map((s) => ({ href: here({ section: s === sections[0] ? undefined : s }), label: SECTION_LABEL[s], active: section === s }))} /> : null}
      </PageHeader>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {section === 'money' ? (
          <FilterPills label="Month" items={months.map((m) => ({ href: here({ month: m }), label: monthLabel(m), active: params.month === m }))} />
        ) : (
          <FilterPills label="Signups in" items={PERIODS.map((k) => ({ href: here({ period: k === '90d' ? undefined : k }), label: PERIOD_LABEL[k], active: params.period === k }))} />
        )}
        {section === 'marketing' ? <FilterPills label="Group by" items={MARKETING_GROUPS.map((g) => ({ href: here({ group: g === 'source' ? undefined : g }), label: `UTM ${g}`, active: params.group === g }))} /> : null}
      </div>
      {section === 'funnel' && report.funnel ? <FunnelSection report={report.funnel} period={params.period} /> : null}
      {section === 'money' && report.money ? <MoneySection report={report.money} /> : null}
      {section === 'team' && report.team ? <TeamSection rows={report.team} period={params.period} own={p.staff.role === 'sales'} /> : null}
      {section === 'marketing' && report.marketing ? <MarketingSection rows={report.marketing} group={params.group} period={params.period} /> : null}
    </>
  )
}
