import type { Metadata } from 'next'
import Link from 'next/link'
import { Building2, CalendarClock, CalendarX, FileSpreadsheet, Repeat, TrendingUp, UsersRound } from 'lucide-react'
import { requireMember } from '@/lib/ctx'
import { formatDate, formatMonth, todayIST } from '@/lib/dates'
import { buildHref, first, type SearchParams } from '@/lib/list'
import { formatINR, formatINRCompact } from '@/lib/money'
import { BarChart } from '@/components/charts/bar-chart'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { buttonClass } from '@/components/ui/button-styles'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { StatCard } from '@/components/ui/stat-card'
import { FilterTabs } from '@/components/folio/FilterTabs'
import { FirmSwitch } from '@/components/folio/FirmSwitch'
import { Fact, GlassCard, Note, PanelHeader, SolidCard, TableCard, Td, Th, TBODY_ROW, THEAD_ROW } from '@/components/folio/ui'
import { cn } from '@/lib/utils'
import { forecastTotal, type ForecastGroup } from '@/modules/folio/forecast/forecast'
import { billingForecast } from '@/modules/folio/forecast/queries'
import { firmContext } from '@/modules/folio/queries/common'

export const metadata: Metadata = { title: 'Billing forecast' }

const BASE = '/app/folio/forecast'
const short = (m: string) => formatMonth(m).slice(0, 3)
const monthSpan = (months: string[]) => (months.length > 1 ? `${short(months[0])} – ${formatMonth(months[months.length - 1])}` : formatMonth(months[0]))

function GroupTable({ title, groups, months, names }: { title: string; groups: ForecastGroup[]; months: string[]; names: Record<string, string> }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className={THEAD_ROW}>
            <Th>{title}</Th>
            {months.map((m) => <Th key={m} align="right">{short(m)}</Th>)}
            <Th align="right">Total</Th>
          </tr>
        </thead>
        <tbody>
          <tr aria-hidden className="h-1.5" />
          {groups.map((g) => (
            <tr key={g.id} className={TBODY_ROW}>
              <Td>{names[g.id] ?? 'Unknown'}</Td>
              {g.perMonth.map((v, i) => <Td key={months[i]} align="right" className={`whitespace-nowrap tabular-nums ${v ? 'text-white/75' : 'text-fg-3'}`}>{v ? formatINR(v, { decimals: 0 }) : '—'}</Td>)}
              <Td align="right" className="whitespace-nowrap font-medium tabular-nums">{formatINR(g.totalPaise, { decimals: 0 })}</Td>
            </tr>
          ))}
          <tr aria-hidden className="h-2" />
        </tbody>
      </table>
    </div>
  )
}

export default async function ForecastPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  const ctx = await requireMember({ product: 'folio', perm: 'folio.read' })
  const today = todayIST()
  const horizon = first(sp.months) === '3' ? 3 : 6
  const { firms, firm } = await firmContext(ctx, first(sp.firm))
  const f = await billingForecast(ctx, { entityId: firm?.id ?? null, months: horizon, today })
  const total = forecastTotal(f)
  const retainerPaise = f.byMonth.reduce((s, m) => s + m.retainerPaise, 0)
  const milestonePaise = f.byMonth.reduce((s, m) => s + m.milestonePaise, 0)
  const gstPaise = f.byMonth.reduce((s, m) => s + m.gstPaise, 0)
  const late = f.lines.filter((l) => l.late)
  const span = monthSpan(f.months)
  const csvHref = buildHref('/api/folio/forecast/csv', {}, { firm: firm?.code, months: horizon })

  return (
    <>
      <PageHeader
        title="Billing forecast"
        icon={<TrendingUp />}
        description={`What active retainers and pending milestones should bill${firm ? ` for ${firm.name}` : ''}, ${span}. Before GST.`}
        back={{ href: '/app/folio/recurring', label: 'Recurring' }}
        actions={<a className={buttonClass('secondary')} href={csvHref}><FileSpreadsheet className="size-4" /> Export CSV</a>}
      >
        <div className="flex flex-wrap items-center gap-3">
          <FirmSwitch base={BASE} params={sp} firms={firms} firm={firm} />
          <FilterTabs label="Horizon" tabs={[3, 6].map((n) => ({ href: buildHref(BASE, sp, { months: n === 6 ? undefined : '3' }), label: `Next ${n} months`, active: horizon === n }))} />
        </div>
      </PageHeader>

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={`Expected · ${horizon} months`} value={formatINRCompact(total)} hint={`${formatINR(total, { decimals: 0 })} · ${span}`} color="var(--blush)" trend={f.byMonth.map((m) => m.totalPaise)} />
        <StatCard label="From retainers" value={formatINRCompact(retainerPaise)} hint="Every billing date not yet issued" color="var(--info)" />
        <StatCard label="From milestones" value={formatINRCompact(milestonePaise)} hint="Pending phases with a due date in range" color="var(--violet)" />
        <StatCard label="GST on top" value={formatINRCompact(gstPaise)} hint={`About ${formatINRCompact(total + gstPaise)} to invoice, tax included`} color="var(--orange)" />
      </div>

      {late.length ? (
        <Note
          className="mb-4"
          tone="warning"
          action={ctx.can('invoices.write') ? <Link href="/app/folio/recurring" className="text-[13px] font-medium text-white transition-opacity hover:opacity-75">Raise them</Link> : undefined}
        >
          {late.length} {late.length === 1 ? 'billing date is' : 'billing dates are'} already past and not issued ({formatINR(late.reduce((s, l) => s + l.amountPaise, 0), { decimals: 0 })}). They are counted in {formatMonth(f.months[0])}.
        </Note>
      ) : null}

      {f.lines.length ? (
        <div className="grid grid-cols-12 gap-4">
          <GlassCard className="col-span-12 lg:col-span-7">
            <PanelHeader icon={<CalendarClock />} title="By month" subtitle={`Retainers and milestones, ${span}`} className="mb-5" />
            <BarChart labels={f.months.map(short)} stacked series={[{ name: 'Retainers', color: 'var(--info)', data: f.byMonth.map((m) => m.retainerPaise) }, { name: 'Milestones', color: 'var(--violet)', data: f.byMonth.map((m) => m.milestonePaise) }]} formatValue={formatINRCompact} height={220} />
          </GlassCard>
          <TableCard className="col-span-12 lg:col-span-5" icon={<Repeat />} title="Next to bill" subtitle={`${f.lines.length} ${f.lines.length === 1 ? 'billing date' : 'billing dates'} in range`}>
            <ul className="max-h-[300px] overflow-y-auto border-t border-line py-1.5 scroll-fade-y">
              {f.lines.slice(0, 40).map((l) => (
                <li key={`${l.sourceId}-${l.date}`} className={cn('flex items-center justify-between gap-3 px-[23px] py-2', TBODY_ROW)}>
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] text-white">{l.label}</span>
                    <span className="block truncate text-xs text-fg-2">{f.clientNames[l.clientId] ?? 'Unknown client'} · {formatDate(l.date, { short: true })}{firms.length > 1 && !firm ? ` · ${f.firmNames[l.entityId] ?? ''}` : ''}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2.5">
                    {l.late ? <Badge tone="warning">Not raised</Badge> : <span className="text-xs text-fg-3">{l.kind === 'retainer' ? 'Retainer' : 'Milestone'}</span>}
                    <span className="text-[13px] tabular-nums text-white">{formatINRCompact(l.amountPaise)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </TableCard>
          {firms.length > 1 && !firm ? (
            <TableCard className="col-span-12" icon={<Building2 />} title="By firm">
              <GroupTable title="Firm" groups={f.byFirm} months={f.months} names={f.firmNames} />
            </TableCard>
          ) : null}
          <TableCard className="col-span-12" icon={<UsersRound />} title="By client">
            <GroupTable title="Client" groups={f.byClient} months={f.months} names={f.clientNames} />
          </TableCard>
          {f.unscheduled.length ? (
            <SolidCard className="col-span-12">
              <PanelHeader icon={<CalendarX />} title="Milestones with no due date" subtitle="Expected, but not counted in any month until they get a date." className="mb-3" />
              <div>
                {f.unscheduled.map((l) => (
                  <Fact key={l.sourceId} label={`${l.label} · ${f.clientNames[l.clientId] ?? ''}`}>
                    <span className="tabular-nums">{formatINR(l.amountPaise, { decimals: 0 })}</span>
                  </Fact>
                ))}
              </div>
            </SolidCard>
          ) : null}
        </div>
      ) : (
        <SolidCard>
          <EmptyState icon={<TrendingUp />} title="Nothing scheduled to bill" description="Add a retainer or a billing plan with dated milestones and the forecast fills in." action={ctx.can('recurring.write') ? <Button variant="primary" href="/app/folio/recurring">Open recurring</Button> : undefined} />
        </SolidCard>
      )}
    </>
  )
}
