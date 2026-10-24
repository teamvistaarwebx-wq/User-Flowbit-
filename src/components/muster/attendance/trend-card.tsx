import { ChartSpline } from 'lucide-react'
import { formatDate } from '@/lib/dates'
import { buildHref, first, type SearchParams } from '@/lib/list'
import { cn } from '@/lib/utils'
import { AreaChart } from '@/components/charts/area-chart'
import { buttonClass } from '@/components/ui/button-styles'
import { Card, CardHeader } from '@/components/ui/card'
import { DateInput } from '@/components/ui/input'
import { RANGE_KEYS, RANGE_LABEL } from '@/modules/muster/attendance/range'
import type { AttendanceTrend } from '@/modules/muster/attendance/trend'
import { Figures } from '../ui/figures'
import { SegmentLinks } from '../ui/filter-chips'

const RANGE_PARAMS = ['range', 'from', 'to']

type Props = { trend: AttendanceTrend; basePath: string; params: SearchParams; className?: string }

/**
 * Attendance over a range (Today · 1M · 6M · 1Y · Custom), on glass like Project overview: the segmented range
 * control at the right, the figures as a hairline-divided legend, then the mint line (the Figma's "on time").
 */
export function TrendCard({ trend, basePath, params, className }: Props) {
  const { range, tally, points, unit } = trend
  const span = range.start === range.end ? formatDate(range.start, { withWeekday: true }) : `${formatDate(range.start)} – ${formatDate(range.end)}`
  const kept = Object.entries(params).filter(([k]) => !RANGE_PARAMS.includes(k))

  return (
    <Card className={cn('rounded-[14px]', className)}>
      <CardHeader
        label="Attendance"
        icon={<ChartSpline />}
        description={`${span} · ${trend.people} ${trend.people === 1 ? 'person' : 'people'}`}
        actions={
          <SegmentLinks
            label="Range"
            items={[
              ...RANGE_KEYS.filter((k) => k !== 'custom').map((k) => ({ key: k, href: buildHref(basePath, params, { range: k, from: undefined, to: undefined }), label: RANGE_LABEL[k], active: range.key === k })),
              { key: 'custom', label: RANGE_LABEL.custom, active: range.key === 'custom', title: 'Pick dates below' },
            ]}
          />
        }
      />
      <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_auto] 2xl:items-end">
        <Figures
          items={[
            { label: 'Present', value: `${tally.presentPct}%`, hint: `of ${tally.personDays} person-days` },
            { label: 'Late', value: tally.late, tone: tally.late ? 'warning' : undefined },
            { label: 'Absent', value: tally.absent, tone: tally.absent ? 'danger' : undefined },
            { label: 'On leave', value: tally.onLeave },
            { label: 'WFH', value: tally.wfh },
          ]}
        />
        <form method="get" action={basePath} className="flex flex-wrap items-end gap-2">
          {kept.map(([k, v]) => <input key={k} type="hidden" name={k} value={first(v) ?? ''} />)}
          <input type="hidden" name="range" value="custom" />
          <label className="flex flex-col gap-1 text-[13px] text-fg-2">
            From
            <DateInput name="from" defaultValue={range.start} max={range.end} inputSize="sm" className="w-[9.5rem]" />
          </label>
          <label className="flex flex-col gap-1 text-[13px] text-fg-2">
            To
            <DateInput name="to" defaultValue={range.end} inputSize="sm" className="w-[9.5rem]" />
          </label>
          <button type="submit" className={buttonClass('secondary', 'sm')}>Show range</button>
        </form>
      </div>
      {range.problem ? <p className="mt-3 text-[13px] text-warning">{range.problem}</p> : null}
      <div className="mt-6 border-t border-white/[0.12] pt-5">
        {points.length > 1 ? (
          <AreaChart data={points} color="var(--mint)" height={200} formatValue={unit === 'percent' ? (v) => `${Math.round(v)}%` : (v) => String(Math.round(v))} />
        ) : (
          <p className="py-10 text-center text-sm text-fg-2">{points.length ? 'Only one working day in this range. Pick a longer one to see a trend.' : 'No working days with attendance in this range.'}</p>
        )}
        {unit === 'people' ? <p className="mt-2 text-xs text-fg-2">People checked in by each hour today. Marks set by HR count in the figures above.</p> : null}
      </div>
    </Card>
  )
}
