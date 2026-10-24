import { useId } from 'react'
import { areaPath, niceMax, scalePoints, smoothPath } from './geometry'

export type AreaPoint = { label: string; value: number }

export type AreaChartProps = {
  data: AreaPoint[]
  color?: string
  height?: number
  formatValue?: (v: number) => string
  className?: string
  /** Show every nth x label (auto by default). */
  labelEvery?: number
}

/** Responsive area chart with gridlines and x labels (HTML labels so text never stretches). */
export function AreaChart({ data, color = 'var(--orchid)', height = 200, formatValue = (v) => String(v), className, labelEvery }: AreaChartProps) {
  const id = useId().replace(/:/g, '')
  const W = 600
  const max = niceMax(Math.max(0, ...data.map((d) => d.value)))
  const pts = scalePoints(data.map((d) => d.value), W, height, 6, 0, max)
  const every = labelEvery ?? Math.max(1, Math.ceil(data.length / 8))
  return (
    <div className={className}>
      <div className="relative" style={{ height }}>
        <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
          {[max, max / 2, 0].map((v) => (
            <div key={v} className="flex items-center gap-2">
              <span className="w-12 shrink-0 text-right text-[11px] tabular-nums text-fg-2">{formatValue(v)}</span>
              <span className="h-px flex-1 bg-white/[0.05]" />
            </div>
          ))}
        </div>
        <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" className="absolute inset-y-0 left-14 right-0 h-full w-[calc(100%-3.5rem)]" role="img" aria-label="Area chart">
          <defs>
            <linearGradient id={`af-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.32" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={areaPath(pts, height)} fill={`url(#af-${id})`} />
          <path d={smoothPath(pts)} fill="none" stroke={color} strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
          {pts.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r="10" fill="transparent">
              <title>{`${data[i].label}: ${formatValue(data[i].value)}`}</title>
            </circle>
          ))}
        </svg>
      </div>
      <div className="ml-14 mt-2 flex justify-between overflow-hidden text-[11px] tabular-nums text-fg-2">
        {data.map((d, i) => (
          <span key={`${d.label}-${i}`} className={axisLabelClass(i, every, data.length)}>
            {d.label}
          </span>
        ))}
      </div>
    </div>
  )
}

/**
 * Axis labels: every `every`-th one shows (and the last); the rest take no width so 30 daily ticks can't push the
 * row past a phone screen. Below `sm` only every other shown label stays.
 */
function axisLabelClass(i: number, every: number, count: number) {
  const last = i === count - 1
  if (i % every !== 0 && !last) return 'invisible w-0 overflow-hidden'
  return last || (i / every) % 2 === 0 ? 'whitespace-nowrap' : 'whitespace-nowrap max-sm:invisible max-sm:w-0 max-sm:overflow-hidden'
}
