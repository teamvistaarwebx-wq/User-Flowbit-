import { ChartColumn, ChartPie, Trophy } from 'lucide-react'
import { formatMonth } from '@/lib/dates'
import { CLIENT_STATUS_PLURAL } from '@/lib/client-status'
import { formatINRCompact } from '@/lib/money'
import { BarChart } from '@/components/charts/bar-chart'
import { Donut } from '@/components/charts/donut'
import { StatCard } from '@/components/ui/stat-card'
import { GlassCard, PanelHeader } from '@/components/folio/ui'
import type { ClientDashboard } from '@/modules/clients/dashboard'
import { CLIENT_HEALTH, HEALTH_COLOR, HEALTH_LABEL } from '@/modules/clients/health'

const STATUS_COLOR = { active: 'var(--success)', lead: 'var(--warning)', inactive: '#6b6478' } as const

/** KPI tiles and three charts above the clients list. Tiles link to the matching filter. */
export function ClientsDashboard({ data, base }: { data: ClientDashboard; base: string }) {
  const statusSlices = (['active', 'lead', 'inactive'] as const).map((s) => ({ label: CLIENT_STATUS_PLURAL[s], value: data.byStatus[s], color: STATUS_COLOR[s] }))
  const healthSlices = CLIENT_HEALTH.map((h) => ({ label: HEALTH_LABEL[h], value: data.health[h], color: HEALTH_COLOR[h] }))
  const activeCount = data.byStatus.active
  return (
    <div className="mb-4 grid grid-cols-12 gap-4">
      <div className="col-span-12 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total clients" value={data.total} hint={`${data.byStatus.active} active · ${data.byStatus.lead} ${data.byStatus.lead === 1 ? 'prospect' : 'prospects'}`} href={`${base}?status=all`} color="var(--info)" />
        <StatCard label="New in 30 days" value={data.new30} trend={data.newPerMonth} hint="Added to Flowbit" href={`${base}?new=30&status=all&sort=onboarded`} color="var(--violet)" />
        <StatCard label="Active this month" value={data.activeThisMonth} hint="Activity, time or an invoice" color="var(--success)" />
        {data.overduePaise !== null ? <StatCard label="Overdue" value={formatINRCompact(data.overduePaise)} hint="Past due date, all clients" href="/app/folio/invoices?overdue=1" color="var(--danger)" /> : null}
      </div>
      <GlassCard className="col-span-12 md:col-span-6 xl:col-span-4">
        <PanelHeader icon={<ChartPie />} title="Clients by health" subtitle={`${activeCount} active clients`} />
        <div className="mt-5 flex-1">
          <Donut data={activeCount ? healthSlices : statusSlices} centerValue={String(activeCount ? activeCount : data.total)} centerLabel={activeCount ? 'Active' : 'Clients'} size={140} />
          <p className="mt-4 text-xs text-fg-2">
            {statusSlices.map((s) => `${s.value} ${s.label.toLowerCase()}`).join(' · ')}
          </p>
        </div>
      </GlassCard>
      <GlassCard className="col-span-12 md:col-span-6 xl:col-span-4">
        <PanelHeader icon={<ChartColumn />} title="New clients per month" subtitle="Last 12 months, by onboarding date" />
        <div className="mt-5 flex-1">
          <BarChart labels={data.months.map((m) => formatMonth(m).slice(0, 3))} series={[{ name: 'New clients', color: 'var(--violet)', data: data.newPerMonth }]} height={170} />
        </div>
      </GlassCard>
      {data.topRevenue ? (
        <GlassCard className="col-span-12 xl:col-span-4">
          <PanelHeader icon={<Trophy />} title="Top clients by revenue" subtitle="Last 12 months, taxable value net of credit notes" />
          <div className="mt-5 flex-1">
            {data.topRevenue.length ? (
              <BarChart horizontal labels={data.topRevenue.map((r) => r.name)} series={[{ name: 'Revenue', color: 'var(--orchid)', data: data.topRevenue.map((r) => r.value) }]} formatValue={formatINRCompact} />
            ) : (
              <p className="text-sm text-fg-2">No invoices in the last 12 months.</p>
            )}
          </div>
        </GlassCard>
      ) : null}
    </div>
  )
}
