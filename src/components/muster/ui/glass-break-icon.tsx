import type { CSSProperties } from 'react'
import type { BreakKey } from '@/lib/break-types'
import { cn } from '@/lib/utils'
import { BreakIcon } from './break-icon'

/** Each break type's glass tint: a top-lit gradient and the halo colour of its pulse. */
export const BREAK_TINT: Readonly<Record<BreakKey, { from: string; to: string; glow: string; ring: string }>> = {
  lunch: { from: 'rgba(255,170,90,0.55)', to: 'rgba(214,92,40,0.28)', glow: 'rgba(255,140,60,0.45)', ring: '#FFA45C' },
  power_nap: { from: 'rgba(150,140,255,0.55)', to: 'rgba(80,70,200,0.28)', glow: 'rgba(130,120,255,0.45)', ring: '#9C94FF' },
  tea: { from: 'rgba(240,200,140,0.5)', to: 'rgba(150,95,50,0.3)', glow: 'rgba(230,180,110,0.4)', ring: '#E8C08A' },
  personal: { from: 'rgba(110,220,200,0.5)', to: 'rgba(30,140,130,0.28)', glow: 'rgba(90,210,190,0.4)', ring: '#6FDCC8' },
  other: { from: 'rgba(255,255,255,0.32)', to: 'rgba(255,255,255,0.08)', glow: 'rgba(255,255,255,0.3)', ring: '#D9D9D9' },
}

const RING_WIDTH = 2

/**
 * A break type as a small glass tile (backdrop blur over a tinted top-lit
 * gradient, a white rim and an inner highlight, like the check-in clock).
 * `active` breathes a soft halo while on that break; `progress` (0–1) draws a
 * ring timer of the minutes used against the daily limit. Both stop under
 * reduced motion (globals.css), leaving a still icon and a still ring.
 */
export function GlassBreakIcon({ type, size = 28, active = false, progress, className, label }: { type: BreakKey; size?: number; active?: boolean; progress?: number | null; className?: string; label?: string }) {
  const tint = BREAK_TINT[type]
  const ring = progress == null ? null : Math.min(1, Math.max(0, progress))
  const r = size / 2 - RING_WIDTH / 2
  const circumference = 2 * Math.PI * r
  const style = { width: size, height: size, '--glow': tint.glow } as CSSProperties
  return (
    <span role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true} className={cn('relative inline-flex shrink-0 items-center justify-center rounded-full', active && 'animate-break-glow', className)} style={style}>
      <span
        className="absolute inset-[3px] rounded-full border border-white/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.45),inset_0_-4px_8px_rgba(0,0,0,0.25),0_2px_6px_rgba(0,0,0,0.35)] backdrop-blur-md"
        style={{ background: `radial-gradient(120% 90% at 30% 15%, rgba(255,255,255,0.35) 0%, transparent 45%), linear-gradient(160deg, ${tint.from} 0%, ${tint.to} 100%)` }}
      />
      <BreakIcon type={type} className="relative size-[45%] text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.35)]" />
      {ring !== null ? (
        <svg className="pointer-events-none absolute inset-0 -rotate-90" width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={RING_WIDTH} />
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={tint.ring} strokeWidth={RING_WIDTH} strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - ring)} className="transition-[stroke-dashoffset] duration-700 ease-out" />
        </svg>
      ) : null}
    </span>
  )
}
