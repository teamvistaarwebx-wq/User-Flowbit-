/**
 * Where a check-in happened, for the person's own "My attendance" (pure):
 * the office when the workspace has geofences, else "location recorded",
 * with an OpenStreetMap link rounded to about 10 metres. Nothing when the
 * check-in carried no location (location off, or not shared).
 */

export type PunchGeo = Readonly<{ lat?: number | null; lng?: number | null; accuracy?: number | null; inside?: boolean | null; office?: string | null; distanceM?: number | null }>

export type CheckInPlace = Readonly<{ kind: 'office' | 'outside' | 'recorded'; office: string | null; distanceM: number | null; mapUrl: string | null }>

const round = (v: number) => Math.round(v * 10_000) / 10_000

export function checkInPlace(geo: PunchGeo | null | undefined): CheckInPlace | null {
  if (!geo) return null
  const hasPoint = typeof geo.lat === 'number' && typeof geo.lng === 'number' && Number.isFinite(geo.lat) && Number.isFinite(geo.lng)
  const mapUrl = hasPoint ? `https://www.openstreetmap.org/?mlat=${round(geo.lat as number)}&mlon=${round(geo.lng as number)}#map=17/${round(geo.lat as number)}/${round(geo.lng as number)}` : null
  if (geo.inside === true && geo.office) return { kind: 'office', office: geo.office, distanceM: null, mapUrl }
  if (geo.inside === false) return { kind: 'outside', office: geo.office ?? null, distanceM: typeof geo.distanceM === 'number' ? Math.round(geo.distanceM) : null, mapUrl }
  return hasPoint ? { kind: 'recorded', office: null, distanceM: null, mapUrl } : null
}

/** "1.2 km" or "350 m". */
export const formatDistance = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`)
