import { useId, type ReactElement } from 'react'
import type { BreakKey } from '@/lib/break-types'
import { BREAK_TINT } from '@/components/muster/ui/glass-break-icon'

/**
 * The break side of the punch dial: a glass disc in the break type's tint (the same tints as GlassBreakIcon)
 * with its own small drawing and loop. Lunch: a plate and fork that bob under rising steam. Power nap: a moon
 * with floating z's. Tea/coffee: a cup with three curls of steam. Personal/rest: a leaf in a breathing circle.
 * `animate` false leaves every loop still (reduced motion). Drawn on the clock's 100 x 100 grid.
 */
export function BreakDisc({ type, animate, size }: { type: BreakKey; animate: boolean; size: number }) {
  const id = useId().replace(/:/g, '')
  const tint = BREAK_TINT[type]
  const Art = ART[type]
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden>
      <defs>
        <radialGradient id={`bd-face-${id}`} cx="36" cy="28" r="76" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fff" stopOpacity="0.4" />
          <stop offset="0.3" stopColor={tint.from} />
          <stop offset="1" stopColor={tint.to} />
        </radialGradient>
        <linearGradient id={`bd-gloss-${id}`} x1="50" y1="10" x2="50" y2="55" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fff" stopOpacity="0.45" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <mask id={`bd-moon-${id}`}>
          <rect width="100" height="100" fill="#fff" />
          <circle cx="58" cy="44" r="16" fill="#000" />
        </mask>
      </defs>
      {/* Dark glass base under the tint, so the disc reads on any card. */}
      <circle cx="50" cy="50" r="48" fill="#1c1a20" />
      <circle cx="50" cy="50" r="48" fill={`url(#bd-face-${id})`} />
      <path d="M17 44 A34 34 0 0 1 80 30 A40 26 0 0 0 17 44 Z" fill={`url(#bd-gloss-${id})`} />
      <circle cx="50" cy="50" r="46.5" fill="none" stroke="#fff" strokeOpacity="0.32" strokeWidth="0.8" />
      <g stroke="#fff" strokeLinecap="round" strokeLinejoin="round" fill="none" style={{ filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.35))' }}>
        <Art animate={animate} accent={tint.ring} maskId={`bd-moon-${id}`} />
      </g>
    </svg>
  )
}

type ArtProps = { animate: boolean; accent: string; maskId: string }

const loop = (animate: boolean, name: string) => (animate ? name : undefined)
const delay = (s: number) => ({ animationDelay: `${s}s` })

/** A curl of steam rising from (x, y). */
const Steam = ({ x, y, animate, at }: { x: number; y: number; animate: boolean; at: number }) => (
  <path d={`M${x} ${y} q-3 -4 0 -8 q3 -4 0 -8`} strokeWidth="2.6" strokeOpacity="0.85" className={loop(animate, 'dial-steam')} style={delay(at)} />
)

function Lunch({ animate }: ArtProps) {
  return (
    <>
      <Steam x={46} y={40} animate={animate} at={0} />
      <Steam x={56} y={40} animate={animate} at={1.1} />
      <g className={loop(animate, 'dial-bob')}>
        <circle cx="51" cy="60" r="15" strokeWidth="3.4" />
        <circle cx="51" cy="60" r="8.5" strokeWidth="2" strokeOpacity="0.6" />
        <path d="M26 44 v9 M30 44 v9 M34 44 v9 M26 53 q4 4 8 0 M30 56 v20" strokeWidth="2.8" />
        <path d="M74 44 q6 9 0 17 v15" strokeWidth="3" />
      </g>
    </>
  )
}

function Nap({ animate, maskId }: ArtProps) {
  return (
    <>
      <circle cx="46" cy="56" r="20" fill="#fff" stroke="none" fillOpacity="0.95" mask={`url(#${maskId})`} />
      {[
        { x: 64, y: 40, s: 12, at: 0 },
        { x: 71, y: 30, s: 10, at: 1 },
        { x: 77, y: 21, s: 8, at: 2 },
      ].map((z) => (
        <text key={z.x} x={z.x} y={z.y} fontSize={z.s} fontWeight={800} fill="#fff" stroke="none" className={loop(animate, 'dial-zzz')} style={delay(z.at)}>
          z
        </text>
      ))}
    </>
  )
}

function Tea({ animate }: ArtProps) {
  return (
    <>
      <Steam x={42} y={40} animate={animate} at={0} />
      <Steam x={50} y={38} animate={animate} at={0.8} />
      <Steam x={58} y={40} animate={animate} at={1.6} />
      <path d="M32 46 H66 V58 a14 14 0 0 1 -14 14 H46 a14 14 0 0 1 -14 -14 Z" fill="#fff" fillOpacity="0.92" strokeWidth="2" />
      <path d="M66 50 h3 a6.5 6.5 0 0 1 0 13 h-4" strokeWidth="3.2" />
      <path d="M28 79 H70" strokeWidth="3.2" />
    </>
  )
}

function Rest({ animate, accent }: ArtProps) {
  return (
    <>
      <circle cx="50" cy="52" r="25" fill="#fff" fillOpacity="0.14" strokeWidth="1.6" strokeOpacity="0.55" className={loop(animate, 'dial-breathe')} />
      <path d="M36 66 C36 48 48 38 66 38 C66 56 56 66 36 66 Z" fill="#fff" fillOpacity="0.92" strokeWidth="1.6" />
      <path d="M39 63 L58 45" stroke={accent} strokeWidth="2.2" />
    </>
  )
}

function Pause({ animate }: ArtProps) {
  return (
    <g className={loop(animate, 'dial-breathe')}>
      <path d="M42 38 v28 M58 38 v28" strokeWidth="7" />
    </g>
  )
}

const ART: Readonly<Record<BreakKey, (props: ArtProps) => ReactElement>> = { lunch: Lunch, power_nap: Nap, tea: Tea, personal: Rest, other: Pause }
