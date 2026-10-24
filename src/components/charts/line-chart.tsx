import { niceMax, scalePoints, smoothPath } from './geometry'
import { Swatch } from '@/components/ui/swatch'

export type LineSeries = { name: string; color: string; data: number[] }

/** Multi-series line chart with legend. `labels` are the x positions. */
export function LineChart({ series, labels, height = 200, formatValue = (v: number) => String(v), className }: { series: LineSeries[]; labels: string[]; height?: number; formatValue?: (v: number) => string; className?: string }) {
  const W = 600
  const max = niceMax(Math.max(0, ...series.flatMap((s) => s.data)))
  const every = Math.max(1, Math.ceil(labels.length / 8))
  return (
    <div className={className}>
      <div className="mb-3 flex flex-wrap gap-4 text-xs text-fg-2">
        {series.map((s) => (
          <span key={s.name} className="inline-flex items-center gap-1.5">
            <Swatch color={s.color} />
            {s.name}
          </span>
        ))}
      </div>
      <div className="relative" style={{ height }}>
        <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
          {[max, max / 2, 0].map((v) => (
            <div key={v} className="flex items-center gap-2">
              <span className="w-12 shrink-0 text-right text-[11px] tabular-nums text-fg-2">{formatValue(v)}</span>
              <span className="h-px flex-1 bg-white/[0.05]" />
            </div>
          ))}
        </div>
        <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" className="absolute inset-y-0 left-14 h-full w-[calc(100%-3.5rem)]" role="img" aria-label="Line chart">
          {series.map((s) => {
            const pts = scalePoints(s.data, W, height, 6, 0, max)
            return (
              <g key={s.name}>
                <path d={smoothPath(pts)} fill="none" stroke={s.color} strokeWidth="2.2" vectorEffect="non-scaling-stroke" />
                {pts.map((p, i) => (
                  <circle key={i} cx={p.x} cy={p.y} r="8" fill="transparent">
                    <title>{`${s.name} · ${labels[i] ?? ''}: ${formatValue(s.data[i])}`}</title>
                  </circle>
                ))}
              </g>
            )
          })}
        </svg>
      </div>
      <div className="ml-14 mt-2 flex justify-between overflow-hidden text-[11px] tabular-nums text-fg-2">
        {labels.map((l, i) => (
          <span key={`${l}-${i}`} className={axisLabelClass(i, every, labels.length)}>
            {l}
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
