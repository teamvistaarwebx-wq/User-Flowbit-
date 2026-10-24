import type { ReactNode } from 'react'
import { Flame, Gauge, Snowflake } from 'lucide-react'
import { cn } from '@/lib/utils'
import { RingChart } from '@/components/charts/ring-chart'
import { Badge } from '@/components/ui/badge'
import { Swatch } from '@/components/ui/swatch'
import { formatPct, targetState } from '@/modules/orbit/metrics'
import { barWidth } from '@/modules/orbit/report-math'
import { Fact, MeterRow, OverviewCard, PanelHeader } from './parts'

/** Ring colours from the Figma Project overview: indigo for cold outreach, orange for warm conversations. */
const COLD = 'var(--info)'
const WARM = 'var(--orange)'

/** Where the target sits on a ring. At 75% a rate on target still leaves room to show it running ahead. */
const TARGET_AT = 0.75
/** Ring fill (0-100) for a rate: the target lands at three quarters, double the target closes the ring. */
const ringFill = (value: number | null, target: number) => (value === null ? 0 : target <= 0 ? (value > 0 ? 100 : 0) : Math.min(100, (value / target) * TARGET_AT * 100))

export type Rate = { value: number | null; numerator: number; denominator: number; target: number; targetLabel: string }

function TargetBadge({ rate }: { rate: Rate }) {
  if (rate.value === null) return <Badge tone="neutral">No data yet</Badge>
  return targetState(rate.value, rate.target).ok ? <Badge tone="success">On track</Badge> : <Badge tone="warning">Below target</Badge>
}

/**
 * Cold % and Warm % in one card, laid out as the dashboard's Project overview: a legend with 12px square keys
 * and 24/600 figures, two concentric rings (the target sits at three quarters of each ring), a hairline divider, and
 * fact rows with right-aligned values.
 */
export function ConversionOverview({ title, icon, cold, warm, meetings, action, note }: { title: string; icon: ReactNode; cold: Rate; warm: Rate; meetings: number; action?: ReactNode; note?: ReactNode }) {
  const legend = [
    { label: 'Cold conversion', rate: cold, color: COLD },
    { label: 'Warm conversion', rate: warm, color: WARM },
  ]
  return (
    <OverviewCard>
      <PanelHeader icon={icon} title={title} actions={action} />
      <div className="mt-[22px] grid flex-1 grid-cols-[auto_auto] items-center justify-around gap-x-6 gap-y-5 @min-[640px]:grid-cols-[150px_auto_1px_minmax(0,1fr)] @min-[640px]:justify-normal @min-[640px]:gap-x-[19px]">
        <ul className="flex flex-col gap-[19px]">
          {legend.map((l) => (
            <li key={l.label}>
              <span className="flex items-center gap-[9px] text-sm text-white">
                <Swatch color={l.color} />
                {l.label}
              </span>
              <span className="mt-0.5 block pl-[21px] text-2xl font-semibold leading-7 tabular-nums text-white">{formatPct(l.rate.value)}</span>
              <span className="block pl-[21px] text-xs text-[#979797]">Target {l.rate.targetLabel}</span>
            </li>
          ))}
        </ul>
        <div className="justify-self-center">
          <RingChart
            size={156}
            thickness={14}
            gap={10}
            rings={[
              { label: 'Cold, against target at three quarters', value: ringFill(cold.value, cold.target), color: COLD },
              { label: 'Warm, against target at three quarters', value: ringFill(warm.value, warm.target), color: WARM },
            ]}
            centerValue={String(meetings)}
            centerLabel="Meetings"
          />
        </div>
        <span aria-hidden className="hidden h-[150px] w-px self-center bg-line-soft @min-[640px]:block" />
        <div className="col-span-2 min-w-0 @min-[640px]:col-span-1">
          <Fact icon={<Snowflake strokeWidth={1.5} />} label="Booked ÷ contacted">
            <span className="tabular-nums">{cold.numerator} ÷ {cold.denominator}</span>
          </Fact>
          <Fact icon={<Flame strokeWidth={1.5} />} label="Booked ÷ replied">
            <span className="tabular-nums">{warm.numerator} ÷ {warm.denominator}</span>
          </Fact>
          <Fact icon={<Gauge strokeWidth={1.5} />} label="Cold target">
            <TargetBadge rate={cold} />
          </Fact>
          <Fact icon={<Gauge strokeWidth={1.5} />} label="Warm target">
            <TargetBadge rate={warm} />
          </Fact>
          {note ? <p className="mt-3 text-xs leading-[15px] text-fg-2">{note}</p> : null}
        </div>
      </div>
    </OverviewCard>
  )
}

/** Funnel as thick meter rows (width = value ÷ total, min 2.5%), gradient fill with the timeline's sheen. */
export function FunnelBars({ steps, total }: { steps: { label: string; value: number; sub?: string }[]; total: number }) {
  const reserveSub = steps.some((s) => s.sub)
  return (
    <ul className="space-y-3">
      {steps.map((s) => (
        <MeterRow key={s.label} label={s.label} pct={barWidth(s.value, total)} value={s.value.toLocaleString('en-IN')} sub={s.sub} reserveSub={reserveSub} />
      ))}
    </ul>
  )
}

/**
 * A small number in the stat-card type, set straight on the card with a hairline on its left rather than boxed,
 * so a card full of figures doesn't turn into cards inside a card.
 */
export function Tile({ label, value, tone }: { label: string; value: ReactNode; tone?: 'danger' | 'success' | 'neutral' }) {
  return (
    <div className="min-w-0 border-l border-white/[0.14] py-1 pl-3.5">
      <p className="truncate text-xs font-semibold uppercase tracking-[0.04em] text-[#959596]">{label}</p>
      <p className={cn('mt-1 text-2xl font-semibold leading-7 tabular-nums', tone === 'danger' ? 'text-[#FF6A66]' : tone === 'success' ? 'text-[#2DCBAF]' : 'text-white')}>{value}</p>
    </div>
  )
}
