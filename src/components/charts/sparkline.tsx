import { useId } from 'react'
import { ChartDataTable } from './data-table'
import { describeTrend } from './describe'
import { areaPath, scalePoints, smoothPath } from './geometry'

export type SparklineProps = {
  data: number[]
  color?: string
  height?: number
  className?: string
  /** Soft fill under the line (off by default: the Figma stat cards carry a corner wash instead). */
  area?: boolean
  glow?: boolean
  /** Index of the point that gets the filled end-marker (Figma stat cards); none when omitted. */
  marker?: number
  /** Reveal left to right once on mount (stilled under reduced motion). Default true. */
  draw?: boolean
  /** What the line measures, read by screen readers before the summary (e.g. "Revenue trend"). */
  label?: string
  /** Point labels for the hidden data table; "Point 1", "Point 2"… when omitted. */
  labels?: string[]
  formatValue?: (v: number) => string
}

const W = 100

/** 2px trend line with a glow (stat cards). Colour is any CSS colour, e.g. 'var(--danger)'. */
export function Sparkline({ data, color = 'var(--info)', height = 40, className, area = false, glow = true, marker, draw = true, label = 'Trend', labels, formatValue = String }: SparklineProps) {
  const id = useId().replace(/:/g, '')
  const values = data.length ? data : [0, 0]
  const pts = scalePoints(values, W, height, 5)
  const line = smoothPath(pts)
  const mark = marker != null ? pts[Math.min(pts.length - 1, Math.max(0, marker))] : undefined
  const summary = `${label}. ${describeTrend(data, formatValue)}`
  const rowLabels = data.map((_, i) => labels?.[i] ?? `Point ${i + 1}`)
  return (
    <div className={className} style={{ position: 'relative', width: '100%', height }}>
      <ChartDataTable caption={summary} labels={rowLabels} series={[{ name: label, data }]} formatValue={formatValue} />
      <svg
        viewBox={`0 0 ${W} ${height}`}
        preserveAspectRatio="none"
        style={{ width: '100%', height, overflow: 'visible', animation: draw ? 'reveal-x 900ms var(--ease-out) both' : undefined }}
        role="img"
        aria-label={summary}
      >
        <defs>
          <linearGradient id={`sf-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.3" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
          <filter id={`sg-${id}`} x="-20%" y="-60%" width="140%" height="220%">
            <feGaussianBlur stdDeviation="2.2" />
          </filter>
        </defs>
        {area ? <path d={areaPath(pts, height)} fill={`url(#sf-${id})`} /> : null}
        {glow ? <path d={line} fill="none" stroke={color} strokeWidth="5" strokeOpacity="0.5" filter={`url(#sg-${id})`} vectorEffect="non-scaling-stroke" /> : null}
        <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
      {mark ? (
        <span
          aria-hidden
          className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-black/25"
          style={{ left: `${(mark.x / W) * 100}%`, top: `${(mark.y / height) * 100}%`, background: color, boxShadow: `0 0 10px ${color}` }}
        />
      ) : null}
    </div>
  )
}
