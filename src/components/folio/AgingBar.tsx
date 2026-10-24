import Link from 'next/link'
import type { ReactNode } from 'react'
import { formatINRCompact, pct } from '@/lib/money'
import { cn } from '@/lib/utils'
import { AGING_BUCKETS, AGING_LABELS, type AgingSummary } from '@/modules/folio/engine/aging'
import { Swatch } from '@/components/ui/swatch'

type Bucket = (typeof AGING_BUCKETS)[number]

/**
 * One colour per age, all from the Figma status set, so the bar reads left to right from healthy to late:
 * mint (on time), amber (late), orange, pink (absent), red (overdue).
 */
export const AGING_COLOR: Record<Bucket, string> = {
  current: '#70F3C3',
  '1_30': '#E4BD6D',
  '31_60': '#E68763',
  '61_90': '#F5548C',
  '90_plus': '#FF4540',
}

/** Below this share a segment gets no tick label above it (the legend still carries its figure). */
const MIN_TICK_SHARE = 9
/** Between MIN_TICK_SHARE and this, the label only shows once the bar is wide enough (28rem) to hold it. */
const NARROW_TICK_SHARE = 20

type AgingBarProps = {
  aging: AgingSummary
  /** Makes each legend entry a link (e.g. to the collections list). */
  hrefFor?: (bucket: Bucket) => string
  className?: string
  /** 'lg' 48px like My attendance (default), 'md' 42px like the workday timeline. */
  size?: 'md' | 'lg'
  /** Hide the legend row under the bar. */
  hideLegend?: boolean
}

/**
 * Receivables by age as the dashboard's thick segmented bar: full-radius segments that touch, sized by share,
 * a 1px tick and the % above each wide segment's right end, then a legend of 12px round keys with amounts.
 */
export function AgingBar({ aging, hrefFor, className, size = 'lg', hideLegend }: AgingBarProps) {
  const total = aging.total
  const shown = AGING_BUCKETS.filter((b) => aging[b] > 0)
  const share = (b: Bucket) => (total ? (aging[b] / total) * 100 : 0)
  const ticks = shown.map((b, i) => ({ b, at: shown.slice(0, i + 1).reduce((s, x) => s + share(x), 0) }))
  return (
    <div className={cn('@container', className)}>
      {total > 0 ? (
        <div className="relative mb-1 h-[22px]" aria-hidden>
          {ticks
            .filter((t) => share(t.b) >= MIN_TICK_SHARE)
            .map((t) => (
              <span key={t.b} className={cn('absolute bottom-[-10px] top-0 items-start', share(t.b) < NARROW_TICK_SHARE ? 'hidden @md:flex' : 'flex')} style={{ left: `min(calc(${t.at}% - 1px), calc(100% - 1px))` }}>
                <span className="absolute right-[5px] top-0 whitespace-nowrap text-sm font-semibold leading-none tabular-nums" style={{ color: AGING_COLOR[t.b] }}>
                  {Math.round(share(t.b))}%
                </span>
                <span className="h-full w-px" style={{ background: AGING_COLOR[t.b] }} />
              </span>
            ))}
        </div>
      ) : null}
      <div className={cn('flex w-full overflow-hidden rounded-full', size === 'lg' ? 'h-12' : 'h-[42px]')} role="img" aria-label={`Receivables by age: ${AGING_BUCKETS.map((b) => `${AGING_LABELS[b]} ${formatINRCompact(aging[b])}`).join(', ')}`}>
        {total === 0 ? <div className="h-full w-full rounded-full bg-white/[0.08]" /> : null}
        {shown.map((b) => (
          <span key={b} title={`${AGING_LABELS[b]}: ${formatINRCompact(aging[b])}`} className="h-full min-w-3 rounded-full transition-[width] duration-500 ease-out" style={{ width: `${share(b)}%`, background: AGING_COLOR[b] }} />
        ))}
      </div>
      {hideLegend ? null : (
        <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-5">
          {AGING_BUCKETS.map((b) => {
            const body = (
              <>
                <span className="flex items-center gap-2 whitespace-nowrap text-[13px] text-white/80">
                  <Swatch color={AGING_COLOR[b]} shape="round" />
                  {AGING_LABELS[b]}
                </span>
                <span className="mt-1 block pl-5 text-lg font-semibold leading-6 tabular-nums text-white">{formatINRCompact(aging[b])}</span>
                <span className="block pl-5 text-xs tabular-nums text-fg-2">{pct(aging[b], total)}% of the book</span>
              </>
            )
            return (
              <li key={b} className="min-w-0">
                {hrefFor ? (
                  <Link href={hrefFor(b)} className="-mx-2 block rounded-[10px] px-2 py-1.5 transition-colors duration-150 hover:bg-white/[0.05]">
                    {body}
                  </Link>
                ) : (
                  <div className="py-1.5">{body}</div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

/** Dark ink on the light fills (mint, amber), white on the deep ones, as the Figma day pills. */
const AGING_INK: Record<Bucket, string> = { current: '#1F3B30', '1_30': '#3B2C0B', '31_60': '#3D1709', '61_90': '#FFFFFF', '90_plus': '#FFFFFF' }

/** A filled pill in the bucket's colour, for an invoice's age in a table ("47d · 31–60 days"). */
export function AgingPill({ bucket, children }: { bucket: Bucket; children: ReactNode }) {
  return (
    <span className="inline-flex h-6 items-center whitespace-nowrap rounded-full px-2.5 text-xs font-medium leading-none" style={{ background: AGING_COLOR[bucket], color: AGING_INK[bucket] }}>
      {children}
    </span>
  )
}
