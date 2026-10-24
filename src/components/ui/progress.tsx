import { cn } from '@/lib/utils'
import type { Tone } from '@/lib/status'
import { TONE_DOT } from './badge'
import { Swatch } from './swatch'

const HEIGHT = { sm: 'h-2', md: 'h-4', lg: 'h-[42px]' } as const

/**
 * Progress bar (0-100). A confident bar, not a hairline: `md` 16px, `lg` 42px like the Figma workday
 * timeline (label inside), `sm` 8px for table cells. The fill is the timeline gradient with a slow sheen,
 * or a solid tone.
 */
export function Progress({ value, className, tone, label, size = 'md' }: { value: number; className?: string; tone?: Tone; label?: string; size?: 'sm' | 'md' | 'lg' }) {
  const v = Math.min(100, Math.max(0, value))
  const pct = `${Math.round(v)}%`
  return (
    <div className={className}>
      {label && size !== 'lg' ? (
        <div className="mb-1.5 flex justify-between gap-3 text-[13px] text-fg-2">
          <span className="min-w-0 truncate">{label}</span>
          <span className="shrink-0 font-medium tabular-nums text-fg">{pct}</span>
        </div>
      ) : null}
      <div
        className={cn('relative w-full overflow-hidden bg-white/[0.14]', HEIGHT[size], size === 'lg' ? 'rounded-[8px]' : 'rounded-full')}
        role="progressbar"
        aria-valuenow={Math.round(v)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div className={cn('relative h-full overflow-hidden transition-[width] duration-[600ms] ease-out', size === 'lg' ? 'rounded-[8px]' : 'rounded-full', tone ? TONE_DOT[tone] : 'bg-grad-progress')} style={{ width: pct }}>
          {!tone && v > 0 ? <span aria-hidden className="absolute inset-y-0 left-0 w-[120px] bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.14),transparent)] animate-[sheen_7s_var(--ease-in-out)_infinite]" /> : null}
        </div>
        {size === 'lg' && label ? (
          // A quiet dark chip keeps the label legible over both the pale start of the fill and the track.
          <span className="absolute inset-y-0 left-2 flex items-center">
            <span className="inline-flex h-[26px] items-center rounded-full bg-[#171717]/60 px-3 text-[13px] font-medium tabular-nums text-white backdrop-blur-sm">
              {label} · {pct}
            </span>
          </span>
        ) : null}
      </div>
    </div>
  )
}

export type Segment = { label: string; value: number; tone: Tone; /** Exact fill, overriding the tone (Figma attendance mint/amber/pink). */ color?: string }

/**
 * Thick segmented bar (Figma "My attendance"): full-radius segments that touch, sized by their share, with a
 * 1px tick and the % above each segment's right end. `showLegend` adds 12px round keys underneath.
 */
/** Minimum distance between two tick labels, in % of the bar, before the later one is left unlabelled. */
const MIN_LABEL_GAP = 7

export function SegmentedBar({ segments, className, showLegend = true, size = 'lg' }: { segments: Segment[]; className?: string; showLegend?: boolean; /** 'lg' 48px (default), 'md' 24px. */ size?: 'md' | 'lg' }) {
  const total = segments.reduce((s, x) => s + x.value, 0)
  const shown = segments.filter((s) => s.value > 0)
  const share = (v: number) => (total ? (v / total) * 100 : 0)
  // Each tick sits at the running total of the shares before it, its own included.
  const placed = shown.map((s, i) => ({ ...s, at: shown.slice(0, i + 1).reduce((sum, x) => sum + share(x.value), 0) }))
  // A sliver right after another tick would print its % on top of the neighbour's; it keeps its tick line and
  // the legend below still carries its value.
  const ticks = placed.map((t, i) => ({ ...t, labelled: i === 0 || t.at - placed[i - 1].at >= MIN_LABEL_GAP }))
  return (
    <div className={className}>
      {total > 0 ? (
        <div className="relative mb-1 h-[22px]" aria-hidden>
          {ticks.map((t) => (
            <span key={t.label} className="absolute bottom-[-10px] top-0 flex items-start" style={{ left: `min(calc(${t.at}% - 1px), calc(100% - 1px))` }}>
              {t.labelled ? (
                <span className="absolute right-[5px] top-0 whitespace-nowrap text-sm font-semibold leading-none tabular-nums" style={{ color: t.color ?? `var(--${t.tone === 'neutral' ? 'text-3' : t.tone})` }}>
                  {Math.round(share(t.value))}%
                </span>
              ) : null}
              <span className="h-full w-px" style={{ background: t.color ?? `var(--${t.tone === 'neutral' ? 'text-3' : t.tone})` }} />
            </span>
          ))}
        </div>
      ) : null}
      <div className={cn('flex w-full overflow-hidden rounded-full', size === 'lg' ? 'h-12' : 'h-6')} role="img" aria-label={segments.map((s) => `${s.label} ${Math.round(share(s.value))}%`).join(', ')}>
        {total === 0 ? <div className="h-full w-full rounded-full bg-white/[0.1]" /> : null}
        {shown.map((s) => (
          <div key={s.label} title={`${s.label}: ${s.value}`} className={cn('h-full rounded-full', !s.color && TONE_DOT[s.tone])} style={{ width: `${share(s.value)}%`, background: s.color }} />
        ))}
      </div>
      {showLegend ? (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
          {segments.map((s) => (
            <span key={s.label} className="inline-flex items-center gap-1.5 text-fg">
              <Swatch tone={s.tone} color={s.color} shape="round" />
              {s.label}
              <span className="font-semibold tabular-nums">{total ? Math.round(share(s.value)) : 0}%</span>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  )
}
