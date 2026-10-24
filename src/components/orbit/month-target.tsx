import type { ReactNode } from 'react'

/** Below this fill the count sits on the track, right of the fill, instead of inside it. */
const INSIDE_MIN_PCT = 22

/**
 * The hero strip of Orbit's Today page, built as the Home workday timeline: a glass card holding one THICK 42px
 * bar. The gradient fills up to the meetings booked this month; the target is the solid violet block at the end,
 * like "Half day". A one-line caption under the bar says what the bar is.
 */
export function MonthTarget({ booked, target, caption, aside }: { booked: number; target: number; caption: ReactNode; aside?: ReactNode }) {
  const safeTarget = Math.max(1, target)
  const pct = Math.min(100, (booked / safeTarget) * 100)
  const met = booked >= target && target > 0
  const inside = pct >= INSIDE_MIN_PCT
  return (
    <section aria-label="Meetings this month" className="glass lit-edge-bright @container rounded-[16px] bg-white/[0.05] px-[17px] pb-4 pt-[22px]">
      <div className="relative h-[42px] overflow-hidden rounded-[8px] bg-white/[0.17]" role="progressbar" aria-valuemin={0} aria-valuemax={safeTarget} aria-valuenow={booked} aria-label={`Meetings booked this month: ${booked} of ${target}`}>
        {pct > 0 ? (
          <div className="absolute inset-y-0 left-0 overflow-hidden rounded-[8px] bg-grad-progress transition-[width] duration-[600ms] ease-out" style={{ width: `${pct}%` }}>
            <span aria-hidden className="absolute inset-y-0 left-0 w-[120px] bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.14),transparent)] animate-[sheen_7s_var(--ease-in-out)_infinite]" />
            <span aria-hidden className="absolute inset-y-0 right-0 w-[3px] bg-[linear-gradient(180deg,rgba(255,255,255,0.15),rgba(220,200,240,0.55),rgba(255,255,255,0.15))]" />
            <span aria-hidden className="absolute inset-x-0 bottom-0 h-[10px] bg-[linear-gradient(0deg,color-mix(in_srgb,var(--orchid)_28%,transparent),transparent)]" />
          </div>
        ) : null}
        {!met ? (
          <span className="absolute inset-y-0 right-0 flex w-[92px] items-center justify-center rounded-[8px] bg-[#5E4084] text-[13px] font-semibold tabular-nums text-white @min-[560px]:w-[112px] @min-[560px]:text-sm">
            Target {target}
          </span>
        ) : null}
        <span
          className="pointer-events-none absolute inset-y-0 flex items-center whitespace-nowrap text-sm font-medium tabular-nums text-white"
          style={met ? { right: 14 } : inside ? { right: `max(calc(${100 - pct}% + 12px), 124px)` } : { left: `calc(${pct}% + 12px)` }}
        >
          {met ? `${booked} booked, target ${target} met` : `${booked} booked`}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[13px]">
        <span className="text-white">{caption}</span>
        {aside ? <span className="text-[#979797]">{aside}</span> : null}
      </div>
    </section>
  )
}
