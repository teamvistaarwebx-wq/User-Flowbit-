/** Shared chart math: scale values into an SVG box and build smooth paths. */

export type Pt = { x: number; y: number }

export function scalePoints(values: number[], width: number, height: number, pad = 2, min?: number, max?: number): Pt[] {
  if (!values.length) return []
  const lo = min ?? Math.min(...values)
  const hi = max ?? Math.max(...values)
  const span = hi - lo || 1
  const step = values.length > 1 ? width / (values.length - 1) : 0
  return values.map((v, i) => ({ x: values.length > 1 ? i * step : width / 2, y: pad + (height - pad * 2) * (1 - (v - lo) / span) }))
}

const clamp = (v: number, a: number, b: number) => Math.min(Math.max(v, Math.min(a, b)), Math.max(a, b))

/**
 * Catmull-Rom style smooth path through points. Control points are clamped to each segment's
 * vertical range so the curve never overshoots (no dips below zero next to a spike).
 */
export function smoothPath(points: Pt[]): string {
  if (!points.length) return ''
  if (points.length === 1) return `M${points[0].x},${points[0].y}`
  let d = `M${points[0].x},${points[0].y}`
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] ?? points[i]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[i + 2] ?? p2
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: clamp(p1.y + (p2.y - p0.y) / 6, p1.y, p2.y) }
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: clamp(p2.y - (p3.y - p1.y) / 6, p1.y, p2.y) }
    d += ` C${c1.x},${c1.y} ${c2.x},${c2.y} ${p2.x},${p2.y}`
  }
  return d
}

export const areaPath = (points: Pt[], height: number) =>
  points.length ? `${smoothPath(points)} L${points[points.length - 1].x},${height} L${points[0].x},${height} Z` : ''

/** Arc path for donuts (angles in radians, 0 = top). */
export function arcPath(cx: number, cy: number, r: number, start: number, end: number): string {
  const s = { x: cx + r * Math.sin(start), y: cy - r * Math.cos(start) }
  const e = { x: cx + r * Math.sin(end), y: cy - r * Math.cos(end) }
  const large = end - start > Math.PI ? 1 : 0
  return `M${s.x},${s.y} A${r},${r} 0 ${large} 1 ${e.x},${e.y}`
}

export const niceMax = (value: number) => {
  if (value <= 0) return 1
  const mag = 10 ** Math.floor(Math.log10(value))
  const n = value / mag
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag
}

/** At most this many x-axis labels under a bar chart, so month names never run together at narrow widths. */
export const MAX_AXIS_LABELS = 6

/** Which x-axis labels to print: every one when they fit, else every nth from the first. */
export function axisLabelShown(count: number, max: number = MAX_AXIS_LABELS): (index: number) => boolean {
  if (count <= max) return () => true
  const step = Math.ceil(count / max)
  return (index) => index % step === 0
}
