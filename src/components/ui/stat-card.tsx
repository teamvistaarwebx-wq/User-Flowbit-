import type { ReactNode } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { Sparkline } from '@/components/charts/sparkline'

export type StatCardProps = {
  label: string
  value: ReactNode
  /** Kept for callers; the Figma stat label has no icon, so it is not drawn. */
  icon?: ReactNode
  /** Percent change, e.g. 12 or -4, shown as a pill filled with the card colour. */
  delta?: number | null
  /** For metrics where up is bad (overdue): read by screen readers as "worse"/"better". */
  invert?: boolean
  trend?: number[]
  /** Accent: sparkline, pill and corner wash, e.g. 'var(--info)'. */
  color?: string
  hint?: ReactNode
  href?: string
  className?: string
}

/** Where the end-marker and the pill sit along the line (Figma: about two thirds across). */
const MARKER_AT = 0.68

/**
 * Figma stat card (240 x 121): uppercase label, the count, a ±% pill filled with the accent above a glowing
 * sparkline that ends in a marker, and a wash of the accent in the bottom-right corner.
 */
export function StatCard({ label, value, delta, invert, trend, color = 'var(--info)', hint, href, className }: StatCardProps) {
  const hasTrend = Boolean(trend && trend.length > 1)
  const marker = hasTrend ? Math.round((trend!.length - 1) * MARKER_AT) : undefined
  const pillOnLine = hasTrend && !hint
  const better = delta == null ? null : invert ? delta <= 0 : delta >= 0
  const body = (
    <>
      <span aria-hidden className="pointer-events-none absolute inset-0 rounded-[inherit]" style={{ background: `radial-gradient(60% 75% at 100% 100%, color-mix(in srgb, ${color} 42%, transparent) 0%, transparent 72%)` }} />
      <div className="relative">
        <div className="text-[13px] font-semibold uppercase leading-[18px] tracking-[0.04em] text-fg">{label}</div>
        <div className="mt-1 text-2xl font-semibold leading-[30px] tabular-nums text-fg">{value}</div>
        {hint ? <div className={cn('mt-0.5 text-xs text-fg-2', hasTrend && 'max-w-[42%]')}>{hint}</div> : null}
      </div>
      {delta != null ? (
        <span
          className={cn('absolute top-[34px] inline-flex h-5 min-w-[41px] items-center justify-center rounded-full px-1.5 text-xs font-medium tabular-nums text-white', pillOnLine && '-translate-x-1/2')}
          style={{ background: color, left: pillOnLine ? `calc(12px + (100% - 24px) * ${MARKER_AT})` : undefined, right: pillOnLine ? undefined : 12 }}
          title={better == null ? undefined : better ? 'Better than the previous period' : 'Worse than the previous period'}
        >
          {delta > 0 ? '+' : delta < 0 ? '−' : ''}
          {Math.abs(Math.round(delta))}%
        </span>
      ) : null}
      {hasTrend ? (
        <div className={cn('absolute bottom-[14px] right-3', hint ? 'left-[46%]' : 'left-3')}>
          <Sparkline data={trend!} color={color} height={hint ? 44 : 56} marker={hint ? undefined : marker} label={`${label} trend`} />
        </div>
      ) : null}
    </>
  )
  const classes = cn('glass relative block min-h-[121px] overflow-hidden rounded-[8px] bg-white/[0.015] p-3 pl-[11px]', href && 'lift', className)
  return href ? (
    <Link href={href} className={classes}>
      {body}
    </Link>
  ) : (
    <div className={classes}>{body}</div>
  )
}
