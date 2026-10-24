import { arcPath } from './geometry'
import { Swatch } from '@/components/ui/swatch'

export type DonutSlice = { label: string; value: number; color: string }

/** Donut with a centre value and optional legend. */
export function Donut({ data, size = 160, thickness = 18, centerValue, centerLabel, legend = true, className, formatValue = (v: number) => String(v) }: { data: DonutSlice[]; size?: number; thickness?: number; centerValue?: string; centerLabel?: string; legend?: boolean; className?: string; formatValue?: (v: number) => string }) {
  const total = data.reduce((s, d) => s + d.value, 0)
  const r = (size - thickness) / 2
  const c = size / 2
  const gap = data.filter((d) => d.value > 0).length > 1 ? 0.04 : 0
  let angle = 0
  return (
    <div className={`flex flex-wrap items-center gap-6 ${className ?? ''}`}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label="Donut chart">
          <circle cx={c} cy={c} r={r} fill="none" stroke="var(--ring-track)" strokeWidth={thickness} />
          {total > 0
            ? data.map((d) => {
                if (d.value <= 0) return null
                const sweep = (d.value / total) * Math.PI * 2
                const start = angle + gap / 2
                const end = Math.max(start + 0.001, angle + sweep - gap / 2)
                angle += sweep
                return (
                  <path key={d.label} d={sweep >= Math.PI * 2 - 0.001 ? arcPath(c, c, r, 0, Math.PI * 2 - 0.0001) : arcPath(c, c, r, start, end)} fill="none" stroke={d.color} strokeWidth={thickness} strokeLinecap="butt">
                    <title>{`${d.label}: ${formatValue(d.value)}`}</title>
                  </path>
                )
              })
            : null}
        </svg>
        {centerValue || centerLabel ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            {centerValue ? <span className="text-xl font-semibold text-fg">{centerValue}</span> : null}
            {centerLabel ? <span className="text-[11px] text-fg-3">{centerLabel}</span> : null}
          </div>
        ) : null}
      </div>
      {legend ? (
        <ul className="space-y-2 text-xs">
          {data.map((d) => (
            <li key={d.label} className="flex items-center gap-2 text-fg-2">
              <Swatch color={d.color} />
              <span>{d.label}</span>
              <span className="ml-auto pl-3 font-semibold text-fg">{formatValue(d.value)}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
