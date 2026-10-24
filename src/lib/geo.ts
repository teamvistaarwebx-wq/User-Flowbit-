/**
 * Location at check-in (pure, client-safe). The browser's position is read
 * only at the moment of a check-in or check-out, never tracked. A workspace
 * sets the mode (off, optional, required) and, optionally, office geofences
 * (a point and a radius in metres); a punch outside every fence is either
 * flagged or refused. The punch keeps the point, its accuracy and the result.
 */

export const GEO_MODES = ['off', 'optional', 'required'] as const
export type GeoMode = (typeof GEO_MODES)[number]
export const OUTSIDE_POLICIES = ['flag', 'block'] as const
export type OutsidePolicy = (typeof OUTSIDE_POLICIES)[number]

export const MIN_RADIUS_M = 25
export const MAX_RADIUS_M = 5000
export const MAX_OFFICES = 20
export const DEFAULT_RADIUS_M = 100
/** A new office's laptop circle: laptops place themselves by Wi-Fi, often hundreds of metres out. */
export const DEFAULT_LAPTOP_RADIUS_M = 2500
export const MAX_ADDRESS = 300
/** A reading less precise than this is a guess from the IP address or a cell area, not the device's place. */
export const MAX_ACCURACY_M = 5000
/** Bump when the notice text changes; people consent again to the new wording. */
export const LOCATION_NOTICE_VERSION = 1
export const LOCATION_NOTICE =
  'When you check in or out, Flowbit reads your location once and saves it with that punch, so HR can confirm where you worked. It is never tracked in the background, and only HR and your managers see it.'

const EARTH_RADIUS_M = 6_371_000

export type LatLng = Readonly<{ lat: number; lng: number }>
/**
 * An office area: the pin and two circles. `radiusM` holds a precise (phone GPS) reading; `laptopRadiusM` is used
 * when the reading is rougher than that (a laptop's Wi-Fi fix). Paused offices (`active: false`) are skipped.
 */
export type Office = Readonly<{ id: string; name: string; address?: string; lat: number; lng: number; radiusM: number; laptopRadiusM: number; active: boolean }>
export type GeoSettings = Readonly<{ mode: GeoMode; outside: OutsidePolicy; offices: readonly Office[] }>
export type GeoReading = Readonly<{ lat: number; lng: number; accuracy?: number | null }>

/** What a punch stores. `inside` is absent when the workspace has no geofence; `radiusM` is the circle it was checked against. */
export type GeoRecord = { lat: number; lng: number; accuracy?: number; inside?: boolean; office?: string; distanceM?: number; radiusM?: number }

export const DEFAULT_GEO: GeoSettings = { mode: 'off', outside: 'flag', offices: [] }

const rad = (deg: number) => (deg * Math.PI) / 180

/** Great-circle distance in metres (haversine). */
export function haversineMetres(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

export const isValidPoint = (p: Partial<LatLng> | null | undefined): p is LatLng =>
  Boolean(p) && Number.isFinite(p!.lat) && Number.isFinite(p!.lng) && Math.abs(p!.lat!) <= 90 && Math.abs(p!.lng!) <= 180

/** The circle a reading is held to: the phone circle, or the laptop circle when the reading is rougher than the phone circle. */
export const circleFor = (office: Office, accuracy?: number): number =>
  accuracy !== undefined && accuracy > office.radiusM ? Math.max(office.radiusM, office.laptopRadiusM) : office.radiusM

export type Fence = { office: Office; distanceM: number; radiusM: number; inside: boolean; rough: boolean }

/**
 * The nearest active office and whether the point is inside it; null when there are none. Inside means within the
 * circle and precise enough to tell (accuracy no wider than the circle); `rough` is within it but too imprecise.
 */
export function nearestOffice(point: LatLng, offices: readonly Office[], accuracy?: number): Fence | null {
  let best: Fence | null = null
  for (const office of offices) {
    if (!office.active) continue
    const distanceM = haversineMetres(point, office)
    const radiusM = circleFor(office, accuracy)
    const within = distanceM <= radiusM
    const rough = within && accuracy !== undefined && accuracy > radiusM
    const inside = within && !rough
    // Prefer any fence the point is inside; among equals, the closest.
    if (!best || (inside && !best.inside) || (inside === best.inside && distanceM < best.distanceM)) best = { office, distanceM, radiusM, inside, rough }
  }
  return best
}

export type PunchGeoDecision = { ok: true; geo?: GeoRecord } | { ok: false; error: string }

const formatMetres = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`)

/**
 * Decides a web check-in or check-out: what to store, or why it is refused. Breaks never ask for a location.
 * `consented`: the person has accepted the location notice (a location is never stored without it).
 */
export function decidePunchGeo(settings: GeoSettings, punchType: string, reading: GeoReading | null | undefined, consented: boolean): PunchGeoDecision {
  if (settings.mode === 'off' || (punchType !== 'in' && punchType !== 'out')) return { ok: true }
  const verb = punchType === 'in' ? 'check in' : 'check out'
  if (!reading) return settings.mode === 'required' ? { ok: false, error: `Your workspace needs your location to ${verb}. Allow location for Flowbit in your browser and try again.` } : { ok: true }
  if (!consented) return { ok: false, error: 'Accept the location notice first.' }
  // A reading without its accuracy cannot be held to an office circle; the browser always reports one.
  const accuracy = reading.accuracy != null && Number.isFinite(reading.accuracy) && reading.accuracy >= 0 ? Math.round(reading.accuracy) : undefined
  if (!isValidPoint(reading) || accuracy === undefined) return { ok: false, error: 'That location could not be read. Try again.' }
  // Too rough to place anyone: refused when the location is required, else the punch is saved without it.
  if (accuracy > MAX_ACCURACY_M) {
    return settings.mode === 'required' ? { ok: false, error: `Your location is too rough to ${verb} (about ${formatMetres(accuracy)} off). Turn on location services, move near a window and try again.` } : { ok: true }
  }
  const base: GeoRecord = { lat: reading.lat, lng: reading.lng, accuracy }
  const fence = nearestOffice(reading, settings.offices, accuracy)
  if (!fence) return { ok: true, geo: base }
  const distanceM = Math.round(fence.distanceM)
  if (!fence.inside && settings.outside === 'block') {
    return {
      ok: false,
      error: fence.rough
        ? `Your location is only accurate to about ${formatMetres(accuracy)}, too rough to confirm you are at ${fence.office.name}. Turn on location services, move near a window and try again.`
        : `You are ${formatMetres(distanceM)} from ${fence.office.name}, outside its ${formatMetres(fence.radiusM)} area. Move closer to ${verb}, or ask HR.`,
    }
  }
  return { ok: true, geo: { ...base, inside: fence.inside, office: fence.office.name, distanceM, radiusM: fence.radiusM } }
}

export type LocationConsent = { at: Date; version: number }

/** True when the person must (re)accept the notice before a location is read. */
export const needsLocationConsent = (consent: { version?: number | null; at?: Date | null } | null | undefined, version: number = LOCATION_NOTICE_VERSION): boolean =>
  !consent?.at || (consent.version ?? 0) < version

/** The consent to store (now, current notice version). */
export const consentRecord = (now: Date, version: number = LOCATION_NOTICE_VERSION): LocationConsent => ({ at: now, version })

/** A Google Maps link for a point (no API key needed). */
export const mapsUrl = (p: LatLng): string => `https://www.google.com/maps?q=${p.lat.toFixed(6)},${p.lng.toFixed(6)}`

export type OfficeInput = { id?: string | null; name?: string | null; address?: string | null; lat?: number | string | null; lng?: number | string | null; radiusM?: number | string | null; laptopRadiusM?: number | string | null; active?: boolean | null }

const clampRadius = (value: number, min = MIN_RADIUS_M) => Math.round(Math.min(MAX_RADIUS_M, Math.max(min, value)))

/**
 * Cleans office rows (settings, stored data): names trimmed, radii clamped (the laptop circle never smaller than the
 * phone one), invalid points dropped, at most MAX_OFFICES. Offices saved before the laptop circle existed keep their
 * one circle for both; before ids existed, they are numbered in order.
 */
export function cleanOffices(rows: readonly OfficeInput[]): Office[] {
  const seen = new Set<string>()
  return rows
    .map((r, i): Office => {
      const radiusM = clampRadius(Number(r.radiusM) || 200)
      const address = (r.address ?? '').trim().slice(0, MAX_ADDRESS)
      let id = (r.id ?? '').trim().slice(0, 40) || `o${i + 1}`
      if (seen.has(id)) id = `${id}-${i + 1}`
      seen.add(id)
      return {
        id,
        name: (r.name ?? '').trim().slice(0, 80),
        ...(address ? { address } : {}),
        lat: Number(r.lat),
        lng: Number(r.lng),
        radiusM,
        laptopRadiusM: clampRadius(Number(r.laptopRadiusM) || radiusM, radiusM),
        active: r.active !== false,
      }
    })
    .filter((o) => o.name && isValidPoint(o) && !(o.lat === 0 && o.lng === 0))
    .slice(0, MAX_OFFICES)
}

/** Merges stored settings over the defaults (missing or unknown values fall back). */
export function geoSettingsOf(stored: Partial<{ mode: string; outside: string; offices: readonly OfficeInput[] }> | null | undefined): GeoSettings {
  const mode = (GEO_MODES as readonly string[]).includes(stored?.mode ?? '') ? (stored!.mode as GeoMode) : DEFAULT_GEO.mode
  const outside = (OUTSIDE_POLICIES as readonly string[]).includes(stored?.outside ?? '') ? (stored!.outside as OutsidePolicy) : DEFAULT_GEO.outside
  return { mode, outside, offices: cleanOffices(stored?.offices ?? []) }
}
