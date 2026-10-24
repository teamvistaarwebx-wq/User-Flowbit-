import type { Metadata } from 'next'
import Link from 'next/link'
import { BookOpen, CalendarCheck, ChartColumn, Download, Eye, HandCoins, Landmark, Banknote, Plane, Receipt, Users } from 'lucide-react'
import { breadcrumbFor } from '@/lib/catalog'
import { requireMember } from '@/lib/ctx'
import { formatMonth, monthOf, shiftMonth, todayIST } from '@/lib/dates'
import { buildHref, first, type SearchParams } from '@/lib/list'
import { cn } from '@/lib/utils'
import { buttonClass } from '@/components/ui/button-styles'
import { DownloadLink } from '@/components/ui/download-link'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { Callout } from '@/components/muster/payroll/callout'
import { ListCard, ListRow, ListRows, TABLE } from '@/components/muster/ui/list-card'
import { MonthPicker } from '@/components/muster/reports/month-picker'
import { buildReport } from '@/modules/muster/reports/builders'
import { REPORTS, REPORT_KEYS, isReportKey, type ReportKey } from '@/modules/muster/reports/catalog'

export const metadata: Metadata = { title: 'HR reports' }
const BASE = '/app/hr/reports'
const ICONS = { Users, CalendarCheck, Plane, Banknote, Landmark, BookOpen, Receipt, HandCoins }
const PREVIEW_ROWS = 25

export default async function HrReportsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  const ctx = await requireMember({ product: 'muster', perm: 'hr.reports' })
  const raw = first(sp.month) ?? ''
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(raw) ? raw : shiftMonth(monthOf(todayIST()), -1)
  const allowed = (key: ReportKey) => (!REPORTS[key].payroll || (ctx.can('payroll.read') && ctx.hasFeature('muster.payroll'))) && (key !== 'claims' || ctx.can('claims.read'))
  const keys = REPORT_KEYS.filter(allowed)
  const selected = isReportKey(first(sp.report)) && allowed(first(sp.report) as ReportKey) ? (first(sp.report) as ReportKey) : null
  const preview = selected ? await buildReport(ctx, selected, month) : null

  return (
    <>
      <PageHeader title="HR reports" description="Every report downloads as CSV for Excel or your CA. Monthly ones use the month you pick." breadcrumb={breadcrumbFor(BASE)} actions={<MonthPicker month={month} label={formatMonth(month)} />} />
      {/* One list of reports, as the dashboard's "Assign to me" table, rather than a wall of identical cards. */}
      <ListCard label="Reports" icon={<ChartColumn />} description={`${keys.length} reports · monthly ones cover ${formatMonth(month)}`}>
        <ListRows>
          {keys.map((key) => {
            const def = REPORTS[key]
            const Icon = ICONS[def.icon]
            const download = `/api/muster/reports/${key}${def.monthly ? `?month=${month}` : ''}`
            return (
              <ListRow key={key} className={cn('flex-nowrap gap-4', selected === key && 'bg-white/[0.06] shadow-[inset_2px_0_0_rgba(255,255,255,0.6)]')}>
                <Icon className="size-4 shrink-0 text-icon-muted" />
                <span className="min-w-0 flex-1">
                  <span className="block text-white">{def.label}</span>
                  <span className="block truncate text-xs text-fg-2">{def.description}</span>
                </span>
                <span className="hidden w-28 shrink-0 text-[13px] text-[#979797] md:block">{def.monthly ? formatMonth(month) : 'All time'}</span>
                <span className="flex shrink-0 items-center gap-2">
                  {key === 'gratuity' ? (
                    <Link href={`${BASE}/gratuity`} className={buttonClass('secondary', 'sm')}>
                      <Eye className="size-3.5" /> Open
                    </Link>
                  ) : (
                    <Link href={buildHref(BASE, sp, { report: key })} scroll={false} aria-current={selected === key ? 'true' : undefined} className={buttonClass('secondary', 'sm')}>
                      <Eye className="size-3.5" /> Preview
                    </Link>
                  )}
                  <a href={download} className={buttonClass('violet', 'sm')}>
                    <Download className="size-3.5" /> CSV
                  </a>
                </span>
              </ListRow>
            )
          })}
        </ListRows>
      </ListCard>
      {preview ? (
        <div className="mt-3">
          {!preview.ok ? (
            <Callout tone="warning" title={preview.error} />
          ) : (
            <ListCard
              label={preview.table.title}
              icon={<Eye />}
              description={`${preview.table.rows.length} row${preview.table.rows.length === 1 ? '' : 's'}${preview.table.rows.length > PREVIEW_ROWS ? `, first ${PREVIEW_ROWS} shown` : ''}`}
              actions={
                <DownloadLink href={`/api/muster/reports/${selected}?month=${month}`} className={buttonClass('secondary', 'sm')} fallbackName={`${selected}-${month}.csv`}>
                  <Download className="size-3.5" /> Download all
                </DownloadLink>
              }
            >
              {preview.table.rows.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-[12px]">
                    <thead>
                      <tr className={TABLE.headRow}>
                        {preview.table.header.map((h) => <th key={h} className="h-[33px] whitespace-nowrap px-3 text-left text-[13px] font-normal text-white">{h}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.table.rows.slice(0, PREVIEW_ROWS).map((row, i) => (
                        <tr key={i} className={TABLE.row}>
                          {row.map((cell, j) => <td key={j} className="h-9 whitespace-nowrap px-3 tabular-nums text-white/80">{cell === null || cell === undefined || cell === '' ? '—' : String(cell)}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState compact icon={<ChartColumn />} title="Nothing to report for this period" />
              )}
            </ListCard>
          )}
        </div>
      ) : null}
    </>
  )
}
