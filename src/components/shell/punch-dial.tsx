'use client'

import { useState, useSyncExternalStore, type CSSProperties } from 'react'
import type { BreakKey } from '@/lib/break-types'
import { cn } from '@/lib/utils'
import { BREAK_TINT } from '@/components/muster/ui/glass-break-icon'
import { GlossyClock, type ClockTone } from './glossy-clock'
import { BreakDisc } from './punch-dial-art'
import { dialMotion, prefersReducedMotion, type DialRing, type DialVisual, type RingTone } from './punch-dial-model'

/** The Figma's illustration time (hour hand near 10, minute hand at 3), shown until the dial mounts. */
const FIGMA_TIME = new Date(2026, 6, 14, 10, 15)
/** On a break the hands sweep up to 12 as the clock shrinks into the icon. */
const NOON = new Date(2026, 6, 14, 12, 0)

const RING_R = 45.2
const RING_WIDTH = 3.4

const TONE: Record<DialVisual['kind'], ClockTone> = { idle: 'out', working: 'in', break: 'break', done: 'out' }

const ringColour = (tone: RingTone, breakType: BreakKey): string =>
  tone === 'work' ? 'rgba(255,255,255,0.92)' : tone === 'warn' ? 'var(--warning)' : tone === 'over' ? 'var(--danger)' : tone === 'done' ? 'var(--success)' : BREAK_TINT[breakType].ring

const MOTION_QUERY = '(prefers-reduced-motion: reduce)'

function subscribeMotion(onChange: () => void): () => void {
  const media = window.matchMedia(MOTION_QUERY)
  media.addEventListener('change', onChange)
  // Settings -> Appearance writes html[data-motion]; follow it live too.
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-motion'] })
  return () => {
    media.removeEventListener('change', onChange)
    observer.disconnect()
  }
}

/** Reduced motion from the user's choice over the OS setting; false on the server. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeMotion,
    () => prefersReducedMotion(document.documentElement.dataset.motion, window.matchMedia(MOTION_QUERY).matches),
    () => false,
  )
}

export type PunchDialProps = {
  visual: DialVisual
  ring: DialRing
  /** The time the hands show: now while working or idle, the check-out time once done. */
  time: Date
  /** After hydration: the real time and the second hand appear (the server renders the Figma time). */
  mounted: boolean
  /** Read politely to screen readers, e.g. "On break: Lunch Break, 12 minutes". */
  status: string
  size?: number
  className?: string
}

/**
 * The check-in dial, one component for every place the punch state shows (side-panel card, phone top bar).
 * Idle: a calm grey clock with a ticking second hand. Working: the green clock runs and a ring fills toward the
 * workday. On a break the clock shrinks and turns away while the break's own glass icon springs in (about half a
 * second); its ring is the break type's minutes against the daily limit, amber near it and red past it. Resume
 * morphs back. Checked out: the hands stop at the check-out time and a check-mark ring appears. Reduced motion
 * swaps pictures at once and stills every loop. Transform and opacity only.
 */
export function PunchDial({ visual, ring, time, mounted, status, size = 92, className }: PunchDialProps) {
  const reduced = useReducedMotion()
  const motion = dialMotion(reduced)
  const onBreak = visual.kind === 'break'
  // The last break type stays drawn while the icon morphs back into the clock.
  const [breakType, setBreakType] = useState<BreakKey>(onBreak ? visual.breakType : 'other')
  if (onBreak && visual.breakType !== breakType) setBreakType(visual.breakType)

  const layer = (shown: boolean, hiddenTransform: string): CSSProperties => ({
    opacity: shown ? 1 : 0,
    transform: shown ? 'scale(1) rotate(0deg)' : hiddenTransform,
    transition: `transform ${motion.morphMs}ms ${motion.ease}, opacity ${Math.round(motion.morphMs * 0.7)}ms ease-out`,
    willChange: 'transform, opacity',
  })
  const handsTime = !mounted ? FIGMA_TIME : onBreak ? NOON : time
  const secondDelay = `-${time.getSeconds() + time.getMilliseconds() / 1000}s`
  const showSecond = mounted && motion.loops && (visual.kind === 'working' || visual.kind === 'idle')

  return (
    <div className={cn('relative shrink-0', className)} style={{ width: size, height: size }} data-dial={visual.kind}>
      <div className="absolute inset-0" style={layer(!onBreak, 'scale(0.5) rotate(-120deg)')} aria-hidden>
        <GlossyClock tone={TONE[visual.kind]} time={handsTime} size={size} className={visual.kind === 'done' ? '[&_line]:opacity-40' : undefined} />
        <svg viewBox="0 0 100 100" width={size} height={size} className="absolute inset-0">
          {showSecond ? (
            <g className={visual.kind === 'working' ? 'dial-second' : 'dial-second-tick'} style={{ animationDelay: secondDelay }}>
              <line x1="50" y1="56" x2="50" y2="14" stroke="#fff" strokeOpacity="0.85" strokeWidth="1.4" strokeLinecap="round" />
            </g>
          ) : null}
          {visual.kind === 'done' ? (
            <path d="M34 51 L45 62 L67 39" fill="none" stroke="#fff" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.4))' }} />
          ) : null}
        </svg>
      </div>
      <div className="absolute inset-0" style={layer(onBreak, 'scale(0.5) rotate(90deg)')} aria-hidden>
        <BreakDisc type={breakType} animate={onBreak && motion.loops} size={size} />
      </div>
      <svg viewBox="0 0 100 100" width={size} height={size} className="pointer-events-none absolute inset-0 -rotate-90" aria-hidden style={{ opacity: ring.tone === 'none' ? 0 : 1, transition: `opacity ${motion.morphMs}ms ease-out` }}>
        <circle cx="50" cy="50" r={RING_R} fill="none" stroke="rgba(0,0,0,0.3)" strokeWidth={RING_WIDTH} />
        <circle
          cx="50"
          cy="50"
          r={RING_R}
          fill="none"
          pathLength={100}
          strokeDasharray="100"
          strokeDashoffset={100 * (1 - ring.progress)}
          stroke={ringColour(ring.tone, breakType)}
          strokeOpacity={ring.progress > 0 ? 1 : 0}
          strokeWidth={RING_WIDTH}
          strokeLinecap="round"
          style={{ transition: reduced ? 'none' : 'stroke-dashoffset 700ms var(--ease-out), stroke 300ms ease-out' }}
        />
      </svg>
      <span className="sr-only" role="status" aria-live="polite">
        {status}
      </span>
    </div>
  )
}
