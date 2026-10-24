export type Ring = { label: string; /** 0-100 */ value: number; color: string }

/**
 * Concentric progress rings with a centre label (Figma "Project overview"): outer ring first, 13-15px strokes,
 * #505050 tracks, butt caps, drawn once on mount.
 */
export function RingChart({ rings, size = 186, thickness = 14, gap = 12, centerValue, centerLabel, className }: { rings: Ring[]; size?: number; thickness?: number; gap?: number; centerValue?: string; centerLabel?: string; className?: string }) {
  const c = size / 2
  return (
    <div className={`relative ${className ?? ''}`} style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label={rings.map((r) => `${r.label} ${Math.round(r.value)}%`).join(', ')}>
        {rings.map((ring, i) => {
          // Strokes thin slightly towards the centre, as in the Figma (15 / 14 / 13).
          const sw = Math.max(4, thickness + 1 - i)
          const r = c - (thickness + 1) / 2 - i * (thickness + gap)
          if (r <= sw / 2) return null
          const circ = 2 * Math.PI * r
          const v = Math.min(100, Math.max(0, ring.value))
          return (
            <g key={ring.label} transform={`rotate(-90 ${c} ${c})`}>
              <circle cx={c} cy={c} r={r} fill="none" stroke="var(--ring-track)" strokeWidth={sw} />
              {v > 0 ? (
                <circle
                  cx={c}
                  cy={c}
                  r={r}
                  fill="none"
                  stroke={ring.color}
                  strokeWidth={sw}
                  strokeLinecap="butt"
                  strokeDasharray={`${(v / 100) * circ} ${circ}`}
                  style={{ ['--len' as string]: `${(v / 100) * circ}`, strokeDashoffset: 0, animation: `draw-line 900ms var(--ease-out) ${i * 90}ms both` }}
                >
                  <title>{`${ring.label}: ${Math.round(v)}%`}</title>
                </circle>
              ) : null}
            </g>
          )
        })}
      </svg>
      {centerValue || centerLabel ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center leading-tight">
          {centerValue ? <span className="text-base font-semibold tabular-nums text-fg">{centerValue}</span> : null}
          {centerLabel ? <span className="text-[11px] text-fg">{centerLabel}</span> : null}
        </div>
      ) : null}
    </div>
  )
}
