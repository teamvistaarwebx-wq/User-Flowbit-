import type { Metadata } from 'next'
import { ChartPie, FileSpreadsheet } from 'lucide-react'
import { requireMember } from '@/lib/ctx'
import { todayIST } from '@/lib/dates'
import { buildHref, first, type SearchParams } from '@/lib/list'
import { buttonClass } from '@/components/ui/button-styles'
import { PageHeader } from '@/components/ui/page-header'
import { FilterSelect } from '@/components/folio/FilterSelect'
import { FirmSwitch } from '@/components/folio/FirmSwitch'
import { PeriodPicker } from '@/components/folio/PeriodPicker'
import { Note } from '@/components/folio/ui'
import { resolveBoundedPeriod } from '@/modules/folio/engine/period'
import { firmContext, listEntities } from '@/modules/folio/queries/common'
import { reportCharts } from '@/modules/folio/queries/report-charts'
import { GST_SECTIONS, GST_SECTION_LABELS, periodLabel, REPORT_KEYS, REPORT_LABELS, reportParams, type ReportKey } from '@/modules/folio/queries/report-types'
import { CONCENTRATION_WARN_PCT, runReport } from '@/modules/folio/queries/reports'
import { FilterTabs } from '../receipts/_components/filter-tabs'
import { ReportChartsView } from './_components/report-charts'
import { ReportTableView } from './_components/report-table'

export const metadata: Metadata = { title: 'Folio reports' }

const BASE = '/app/folio/reports'
const gstLabel = (e: { code: string; gstin: string | null }) => `${e.code} · ${e.gstin ?? ''}`

export default async function FolioReportsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  const ctx = await requireMember({ product: 'folio', perm: 'folio.reports' })
  const today = todayIST()
  const requested = first(sp.report)
  // Charts open the page; the tables keep their own tabs (and CSV routes).
  const showCharts = !requested || requested === 'charts'
  const key: ReportKey = (REPORT_KEYS as readonly string[]).includes(requested ?? '') ? (requested as ReportKey) : 'gst'
  const period = resolveBoundedPeriod({ period: first(sp.period), from: first(sp.from), to: first(sp.to) }, today, 'this_fy')
  const p = reportParams((k) => (k === 'from' ? period.from : k === 'to' ? period.to : first(sp[k])), today)
  const [entities, { firms, firm }] = await Promise.all([listEntities(ctx), firmContext(ctx, first(sp.firm))])
  const gstEntities = entities.filter((e) => e.kind === 'gst')
  // GST is filed per GSTIN, so it always needs one; the other reports follow the firm filter.
  const entityId = key === 'gst' ? (gstEntities.find((e) => e.id === p.entityId)?.id ?? gstEntities.find((e) => e.id === firm?.id)?.id ?? gstEntities[0]?.id ?? null) : (firm?.id ?? p.entityId)
  const [table, charts] = await Promise.all([showCharts ? null : runReport(ctx, key, { ...p, entityId }, today), showCharts ? reportCharts(ctx, { from: p.from, to: p.to, entityId: firm?.id ?? null }, today) : null])
  const csvHref = buildHref(`/api/folio/reports/${key}`, {}, { from: p.from, to: p.to, entity: entityId ?? undefined, section: key === 'gst' ? p.section : undefined, by: key === 'revenue' ? p.by : undefined })

  return (
    <>
      <PageHeader
        title="Folio reports"
        description={table ? `${table.title} · ${table.period}` : `Charts · ${periodLabel(p.from, p.to)}`}
        icon={<ChartPie />}
        actions={
          table ? (
            <a className={buttonClass('secondary')} href={csvHref}>
              <FileSpreadsheet className="size-4" /> Export CSV
            </a>
          ) : null
        }
      >
        <div className="space-y-3">
          <FilterTabs label="Report" tabs={[{ href: buildHref(BASE, sp, { report: undefined, section: undefined, by: undefined, entity: undefined }), label: 'Charts', active: showCharts }, ...REPORT_KEYS.map((k) => ({ href: buildHref(BASE, sp, { report: k, section: undefined, by: undefined, entity: undefined }), label: REPORT_LABELS[k], active: !showCharts && k === key }))]} />
          <div className="flex flex-col gap-3 2xl:flex-row 2xl:items-end 2xl:justify-between">
            {showCharts ? (
              <span />
            ) : key === 'gst' ? (
              <FilterTabs tabs={GST_SECTIONS.map((s) => ({ href: buildHref(BASE, { ...sp, report: 'gst' }, { section: s }), label: GST_SECTION_LABELS[s], active: s === p.section }))} />
            ) : key === 'revenue' ? (
              <FilterTabs tabs={[{ href: buildHref(BASE, { ...sp, report: 'revenue' }, { by: undefined }), label: 'By client', active: p.by === 'client' }, { href: buildHref(BASE, { ...sp, report: 'revenue' }, { by: 'month' }), label: 'By month', active: p.by === 'month' }]} />
            ) : (
              <span />
            )}
            {!showCharts && key === 'gst' && gstEntities.length > 1 ? <FilterSelect param="entity" placeholder={gstLabel(gstEntities.find((e) => e.id === entityId) ?? gstEntities[0])} options={gstEntities.map((e) => ({ value: e.id, label: gstLabel(e) }))} className="h-[33px] text-[13px]" /> : null}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {showCharts || key !== 'gst' ? <FirmSwitch base={BASE} params={sp} firms={firms} firm={firm} clear={['entity']} /> : null}
            {showCharts || key !== 'aging' ? <PeriodPicker base={BASE} params={sp} period={period} today={today} /> : <span className="text-[13px] text-fg-2">Aging is always as of today.</span>}
          </div>
        </div>
      </PageHeader>

      {charts ? <ReportChartsView charts={charts} firmCode={firm?.code} period={`from ${periodLabel(p.from, p.to)}`} /> : null}
      {table?.note ? <Note className="mb-4">{table.note}</Note> : null}
      {table ? <ReportTableView table={table} warnAt={CONCENTRATION_WARN_PCT} /> : null}
    </>
  )
}
