import { MapPin } from 'lucide-react'
import { formatTime } from '@/lib/dates'
import { mapsUrl } from '@/lib/geo'
import { cn } from '@/lib/utils'
import type { PunchPlace } from '@/modules/muster/attendance/day-sheet'

const metres = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`)

function label(p: PunchPlace): string {
  const verb = p.type === 'in' ? 'In' : 'Out'
  const accuracy = p.accuracy != null ? ` (±${metres(p.accuracy)})` : ''
  if (p.inside === true) return `${verb} ${formatTime(p.at)} · at ${p.office}${accuracy}`
  // Within the circle but too rough to confirm reads differently from plainly far away.
  if (p.inside === false && p.radiusM != null && p.accuracy != null && (p.distanceM ?? 0) <= p.radiusM) return `${verb} ${formatTime(p.at)} · unconfirmed near ${p.office}${accuracy}`
  if (p.inside === false) return `${verb} ${formatTime(p.at)} · outside, ${metres(p.distanceM ?? 0)} from ${p.office}${accuracy}`
  return `${verb} ${formatTime(p.at)}${p.accuracy != null ? ` · ±${metres(p.accuracy)}` : ''}`
}

/** Where someone checked in and out, each a Google Maps link; outside an office area shows in amber. */
export function PunchPlaces({ places, className }: { places: PunchPlace[]; className?: string }) {
  if (!places.length) return null
  return (
    <p className={cn('flex flex-wrap gap-x-3 gap-y-0.5 text-xs', className)}>
      {places.map((p, i) => (
        <a key={`${p.type}-${i}`} href={mapsUrl(p)} target="_blank" rel="noreferrer" className={cn('inline-flex items-center gap-1 hover:underline', p.inside === false ? 'text-warning' : 'text-fg-2')} title="Open in Google Maps">
          <MapPin className="size-3 shrink-0" aria-hidden />
          {label(p)}
        </a>
      ))}
    </p>
  )
}
