import { cn } from '@/lib/utils'
import { ChartDataTable } from './data-table'
import { columnTotals, describeBars, printsBarValues } from './describe'
import { axisLabelShown, niceMax } from './geometry'

const MAX_WIDE_GAP_BARS = 8

export type BarSeries = { name: string; color: string; data: number[] }

export type BarChartProps = {
  labels: string[]
  series: BarSeries[]
  stacked?: boolean
  height?: number
  formatValue?: (v: number) => string
  className?: string
  /** Horizontal bars (good for "by assignee" / "top debtors"). */
  horizontal?: boolean
}

/** Bar chart in HTML/CSS boxes (crisp at any width). Grouped or stacked series. */
export function BarChart({ labels, series, stacked, height = 200, formatValue = (v) => String(v), className, horizontal }: BarChartProps) {
  const totals = columnTotals(labels, series)
  const summary = describeBars(labels, series, formatValue, stacked)
  const table = <ChartDataTable caption={summary} labels={labels} series={series} formatValue={formatValue} />
  const max = niceMax(stacked ? Math.max(0, ...totals) : Math.max(0, ...series.flatMap((s) => s.data)))
  const legend =
    series.length > 1 ? (
      <div className="mb-3 flex flex-wrap gap-4 text-xs text-fg-2">
        {series.map((s) => (
          <span key={s.name} className="inline-flex items-center gap-1.5">
            <span className="size-3 rounded-[3px]" style={{ background: s.color }} />
            {s.name}
          </span>
        ))}
      </div>
    ) : null

  if (horizontal) {
    return (
      <div className={className}>
        {legend}
        <div role="img" aria-label={summary} className="space-y-3">
          {labels.map((label, i) => (
            <div key={`${label}-${i}`}>
              <div className="mb-1 flex justify-between text-xs">
                <span className="truncate text-fg-2">{label}</span>
                <span className="font-medium text-fg">{formatValue(totals[i])}</span>
              </div>
              <div className="flex h-4 overflow-hidden rounded-full bg-white/[0.1]">
                {series.map((s) => (
                  <div key={s.name} title={`${s.name}: ${formatValue(s.data[i] ?? 0)}`} style={{ width: `${((s.data[i] ?? 0) / max) * 100}%`, background: s.color }} className="h-full first:rounded-l-full last:rounded-r-full" />
                ))}
              </div>
            </div>
          ))}
        </div>
        {table}
      </div>
    )
  }

  // Proportional gaps look right for a handful of bars; with many they eat the width and clip the labels.
  const many = labels.length > MAX_WIDE_GAP_BARS
  const gap = many ? 'gap-1.5' : 'gap-[6%]'
  // Many bars: print every nth label (each label still spans its bar's column, so they stay aligned).
  const shown = axisLabelShown(labels.length)
  // Few bars: print each value above its bar. Otherwise a tap (or click) on a column shows its values in a chip.
  const printed = printsBarValues(labels.length, series.length, stacked)
  return (
    <div className={className}>
      {legend}
      <div role="img" aria-label={summary} className="relative" style={{ height }}>
        <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
          {[max, max / 2, 0].map((v) => (
            <div key={v} className="flex items-center gap-2">
              <span className="w-12 shrink-0 text-right text-[11px] tabular-nums text-fg-2">{formatValue(v)}</span>
              <span className="h-px flex-1 bg-white/[0.05]" />
            </div>
          ))}
        </div>
        <div className={cn('absolute inset-y-0 left-14 right-0 flex items-end px-2', gap)}>
          {labels.map((label, i) => (
            <div
              key={`${label}-${i}`}
              tabIndex={printed ? undefined : -1}
              className={cn('group relative outline-none', stacked ? 'flex h-full flex-1 flex-col-reverse' : 'flex h-full flex-1 items-end justify-center gap-1')}
            >
              {series.map((s) => (
                <div
                  key={s.name}
                  title={`${label} · ${s.name}: ${formatValue(s.data[i] ?? 0)}`}
                  className={cn('relative', stacked ? 'w-full first:rounded-b-md last:rounded-t-md' : 'w-full max-w-7 rounded-t-md')}
                  style={{ height: `${((s.data[i] ?? 0) / max) * 100}%`, background: s.color, boxShadow: `0 0 16px -6px ${s.color}` }}
                >
                  {printed && !stacked ? <BarValue>{formatValue(s.data[i] ?? 0)}</BarValue> : null}
                </div>
              ))}
              {printed && stacked ? <span className="pb-0.5 text-center text-[10px] font-medium leading-3 tabular-nums text-fg">{formatValue(totals[i])}</span> : null}
              {printed ? null : <ValueChip label={label} rows={series.map((s) => ({ name: s.name, color: s.color, value: formatValue(s.data[i] ?? 0) }))} />}
            </div>
          ))}
        </div>
      </div>
      <div aria-hidden className={cn('ml-14 mt-2 flex px-2 text-[11px] tabular-nums text-fg-2', gap)}>
        {labels.map((l, i) => (
          <span key={`${l}-${i}`} className={cn('min-w-0 flex-1 text-center', many ? 'overflow-visible whitespace-nowrap' : 'truncate')}>
            {shown(i) ? l : ''}
          </span>
        ))}
      </div>
      {table}
    </div>
  )
}

/** The number printed just above a bar. */
function BarValue({ children }: { children: string }) {
  return <span className="absolute bottom-full left-1/2 mb-0.5 -translate-x-1/2 whitespace-nowrap text-[10px] font-medium leading-3 tabular-nums text-fg">{children}</span>
}

/** A column's values, shown while the column is hovered or tapped (tapping focuses it). */
function ValueChip({ label, rows }: { label: string; rows: { name: string; color: string; value: string }[] }) {
  return (
    <span className="pointer-events-none invisible absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 whitespace-nowrap rounded-[8px] border border-line bg-menu px-2 py-1 text-[11px] leading-4 text-fg opacity-0 shadow-pop transition-opacity group-hover:visible group-hover:opacity-100 group-focus:visible group-focus:opacity-100">
      <span className="block font-medium">{label}</span>
      {rows.map((r) => (
        <span key={r.name} className="flex items-center gap-1.5 tabular-nums">
          <span className="size-2 rounded-[2px]" style={{ background: r.color }} />
          {r.name}: {r.value}
        </span>
      ))}
    </span>
  )
}
