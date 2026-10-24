import Link from 'next/link'
import type { ReactNode } from 'react'
import { ChartColumn, Hourglass, Landmark, Trophy, Wallet } from 'lucide-react'
import { formatMonth } from '@/lib/dates'
import { buildHref } from '@/lib/list'
import { formatINR, formatINRCompact } from '@/lib/money'
import { BarChart } from '@/components/charts/bar-chart'
import { GlassCard, PanelHeader, Td, Th, TBODY_ROW, TFOOT_ROW, THEAD_ROW } from '@/components/folio/ui'
import { AGING_LABELS, type AgingBucket } from '@/modules/folio/engine/aging'
import type { ReportCharts } from '@/modules/folio/queries/report-charts'

const AGING_COLOR: Record<AgingBucket, string> = { current: 'var(--success)', '1_30': 'var(--warning)', '31_60': 'var(--orange)', '61_90': 'var(--danger)', '90_plus': '#b3261e' }
const INVOICED = 'var(--violet)'
const COLLECTED = 'var(--success)'
const short = (m: string) => formatMonth(m).slice(0, 3)

/** Aging buckets as bars; each bucket links to the open invoices in it. */
function AgingCard({ aging, firmCode }: { aging: ReportCharts['aging']; firmCode?: string }) {
  const max = Math.max(1, ...aging.map((a) => a.paise))
  const total = aging.reduce((s, a) => s + a.paise, 0)
  return (
    <GlassCard className="col-span-12 lg:col-span-5">
      <PanelHeader icon={<Hourglass />} title="Receivables aging" subtitle={`${formatINR(total, { decimals: 0 })} open today · click a bucket to follow up`} />
      <ul className="mt-5 space-y-3">
        {aging.map((a) => (
          <li key={a.bucket}>
            <Link href={buildHref('/app/folio/invoices', {}, { aging: a.bucket, firm: firmCode })} className="group block rounded-[8px] p-1 transition-colors hover:bg-white/[0.04]">
              <span className="mb-1 flex justify-between text-xs">
                <span className="text-fg-2 group-hover:text-white">{AGING_LABELS[a.bucket]} · {a.count} {a.count === 1 ? 'invoice' : 'invoices'}</span>
                <span className="font-medium tabular-nums text-fg">{formatINRCompact(a.paise)}</span>
              </span>
              <span className="block h-3 overflow-hidden rounded-full bg-white/[0.1]">
                <span className="block h-full rounded-full" style={{ width: `${(a.paise / max) * 100}%`, background: AGING_COLOR[a.bucket] }} />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </GlassCard>
  )
}

function TopCard({ title, icon, rows, empty, subtitle }: { title: string; icon: ReactNode; rows: ReportCharts['topRevenue']; empty: string; subtitle: string }) {
  return (
    <GlassCard className="col-span-12 md:col-span-6">
      <PanelHeader icon={icon} title={title} subtitle={subtitle} />
      <div className="mt-5 flex-1">
        {rows.length ? <BarChart horizontal labels={rows.map((r) => r.name)} series={[{ name: title, color: 'var(--orchid)', data: rows.map((r) => r.paise) }]} formatValue={formatINRCompact} /> : <p className="text-sm text-fg-2">{empty}</p>}
      </div>
    </GlassCard>
  )
}

function GstCard({ gst, period }: { gst: ReportCharts['gst']; period: string }) {
  return (
    <GlassCard className="col-span-12">
      <PanelHeader icon={<Landmark />} title="GST summary" subtitle={`Output tax ${period}, net of credit notes`} />
      <div className="mt-5 grid gap-6 lg:grid-cols-2">
        <BarChart
          stacked
          labels={gst.byMonth.map((m) => short(m.month))}
          series={[{ name: 'CGST', color: 'var(--info)', data: gst.byMonth.map((m) => m.cgstPaise) }, { name: 'SGST', color: 'var(--violet)', data: gst.byMonth.map((m) => m.sgstPaise) }, { name: 'IGST', color: 'var(--orchid)', data: gst.byMonth.map((m) => m.igstPaise) }]}
          formatValue={formatINRCompact}
          height={200}
        />
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[420px] text-sm">
            <thead><tr className={THEAD_ROW}><Th>Rate</Th><Th align="right">Taxable</Th><Th align="right">CGST</Th><Th align="right">SGST</Th><Th align="right">IGST</Th></tr></thead>
            <tbody>
              {gst.byRate.length ? gst.byRate.map((r) => (
                <tr key={r.rate} className={TBODY_ROW}><Td>{r.rate}%</Td><Td align="right">{formatINR(r.taxablePaise)}</Td><Td align="right">{formatINR(r.cgstPaise)}</Td><Td align="right">{formatINR(r.sgstPaise)}</Td><Td align="right">{formatINR(r.igstPaise)}</Td></tr>
              )) : <tr><Td colSpan={5} className="text-fg-2">Nothing issued in this period.</Td></tr>}
            </tbody>
            {gst.byRate.length ? (
              <tfoot><tr className={TFOOT_ROW}><Td>Total</Td><Td align="right">{formatINR(gst.totals.taxablePaise)}</Td><Td align="right">{formatINR(gst.totals.cgstPaise)}</Td><Td align="right">{formatINR(gst.totals.sgstPaise)}</Td><Td align="right">{formatINR(gst.totals.igstPaise)}</Td></tr></tfoot>
            ) : null}
          </table>
          {gst.reverseCharge.taxablePaise ? (
            <p className="mt-3 text-xs leading-relaxed text-fg-2">
              Not in output tax: reverse-charge supplies of {formatINR(gst.reverseCharge.taxablePaise)}, on which your clients pay {formatINR(gst.reverseCharge.taxPaise)} GST themselves.
            </p>
          ) : null}
        </div>
      </div>
    </GlassCard>
  )
}

/** The Overview tab of Folio → Reports. */
export function ReportChartsView({ charts, firmCode, period }: { charts: ReportCharts; firmCode?: string; period: string }) {
  return (
    <div className="grid grid-cols-12 gap-4">
      <AgingCard aging={charts.aging} firmCode={firmCode} />
      <GlassCard className="col-span-12 lg:col-span-7">
        <PanelHeader icon={<ChartColumn />} title="Invoiced vs collected" subtitle="Last 12 months, tax included" />
        <div className="mt-5 flex-1">
          <BarChart labels={charts.monthly.map((m) => short(m.month))} series={[{ name: 'Invoiced', color: INVOICED, data: charts.monthly.map((m) => m.invoicedPaise) }, { name: 'Collected', color: COLLECTED, data: charts.monthly.map((m) => m.collectedPaise) }]} formatValue={formatINRCompact} height={220} />
        </div>
      </GlassCard>
      <TopCard title="Top 10 by revenue" icon={<Trophy />} rows={charts.topRevenue} subtitle={`Taxable value ${period}, net of credit notes`} empty="No revenue in this period." />
      <TopCard title="Top 10 by outstanding" icon={<Wallet />} rows={charts.topOutstanding} subtitle="Open balance today" empty="Nothing outstanding." />
      <GstCard gst={charts.gst} period={period} />
    </div>
  )
}
