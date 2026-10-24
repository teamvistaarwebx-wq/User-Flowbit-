import { useId } from 'react'

export type ClockTone = 'in' | 'break' | 'out'

/** Disc colours sampled from the Figma widget (green working, amber on break); grey is the desaturated green. */
const TONES: Record<ClockTone, { hi: string; body: string; deep: string; rim: string; rimLight: string; hub: string }> = {
  in: { hi: '#CFFFE9', body: '#03C27A', deep: '#02803F', rim: '#02591D', rimLight: '#5CF2B8', hub: '#038F4B' },
  break: { hi: '#FFE6B8', body: '#F79A35', deep: '#D35A0C', rim: '#8A2E05', rimLight: '#FFC77A', hub: '#E0660F' },
  out: { hi: '#ECEBEE', body: '#8D8A93', deep: '#5D5A63', rim: '#35333A', rimLight: '#C9C6CE', hub: '#6A6770' },
}

/**
 * The glossy 3D clock disc of the check-in card: a bevelled rim, a domed face with a soft top-left specular,
 * white rounded hands set to the real time, and a small hub in the disc colour.
 */
export function GlossyClock({ tone, time, size = 82, className }: { tone: ClockTone; time: Date; size?: number; className?: string }) {
  const id = useId().replace(/:/g, '')
  const t = TONES[tone]
  const minutes = time.getMinutes() + time.getSeconds() / 60
  const hours = (time.getHours() % 12) + minutes / 60
  const hourAngle = hours * 30
  const minuteAngle = minutes * 6
  const hand = { transition: 'transform 400ms var(--ease-out)', transformOrigin: '50px 50px' }
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={className} aria-hidden>
      <defs>
        <linearGradient id={`rim-${id}`} x1="15" y1="8" x2="85" y2="95" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={t.rimLight} />
          <stop offset="0.45" stopColor={t.body} />
          <stop offset="1" stopColor={t.rim} />
        </linearGradient>
        <radialGradient id={`face-${id}`} cx="38" cy="30" r="70" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={t.hi} />
          <stop offset="0.22" stopColor={t.body} stopOpacity="0.96" />
          <stop offset="0.7" stopColor={t.body} />
          <stop offset="1" stopColor={t.deep} />
        </radialGradient>
        <linearGradient id={`gloss-${id}`} x1="50" y1="10" x2="50" y2="55" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <filter id={`shadow-${id}`} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0.6" dy="1.4" stdDeviation="1" floodColor="#000" floodOpacity="0.35" />
        </filter>
      </defs>
      {/* Rim, then a thin dark groove, then the domed face. */}
      <circle cx="50" cy="50" r="48" fill={`url(#rim-${id})`} />
      <circle cx="50" cy="50" r="42.5" fill={t.rim} opacity="0.55" />
      <circle cx="50" cy="50" r="41.5" fill={`url(#face-${id})`} />
      <path d="M17 44 A34 34 0 0 1 80 30 A40 26 0 0 0 17 44 Z" fill={`url(#gloss-${id})`} />
      <circle cx="50" cy="50" r="46.5" fill="none" stroke="#fff" strokeOpacity="0.28" strokeWidth="0.8" />
      <g filter={`url(#shadow-${id})`}>
        <line x1="50" y1="50" x2="50" y2="25" stroke="#F4F2F0" strokeWidth="5" strokeLinecap="round" style={{ ...hand, transform: `rotate(${hourAngle}deg)` }} />
        <line x1="50" y1="50" x2="50" y2="17" stroke="#F4F2F0" strokeWidth="5" strokeLinecap="round" style={{ ...hand, transform: `rotate(${minuteAngle}deg)` }} />
        <circle cx="50" cy="50" r="5" fill={t.hub} stroke="#fff" strokeOpacity="0.6" strokeWidth="1" />
        <circle cx="48.8" cy="48.6" r="1.6" fill="#fff" opacity="0.7" />
      </g>
    </svg>
  )
}
