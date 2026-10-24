import { cleanOffices, DEFAULT_LAPTOP_RADIUS_M, DEFAULT_RADIUS_M, isValidPoint, MAX_OFFICES, MAX_RADIUS_M, MIN_RADIUS_M, type Office } from '../../src/lib/geo'
import { workModeIn } from '../../src/modules/muster/import/employees'

/**
 * Migration rules (pure) for the check-in setup of the old Work app (database vistaarTask) → Flowbit, decided
 * 2026-10-14 (.plan/migration/decisions.md):
 *  - work mode: Work `employees.workMode` per person, matched to Flowbit employees by work email through Work `users`;
 *  - office locations: Work `orgs.settings.officeLocations` → the workspace's `attendanceGeo.offices`.
 * Past check-in locations (Work `attendances.location`) are deliberately not migrated.
 * Every change or skip is reported in plain words, never with names or emails beyond what HR already sees.
 */

const id = (value: unknown) => (value == null ? '' : String(value))

export type OldEmployee = { _id?: unknown; userId?: unknown; workMode?: unknown }
export type OldUser = { _id?: unknown; email?: unknown }

/**
 * Work emails (lowercase) of the people who work remotely. Office, or no value, is left unset in Flowbit, where
 * unset counts as office. An unknown value is reported and treated as office.
 */
export function remoteWorkEmails(employees: readonly OldEmployee[], users: readonly OldUser[]): { remote: Set<string>; report: string[] } {
  const emailOf = new Map(users.map((u) => [id(u._id), typeof u.email === 'string' ? u.email.trim().toLowerCase() : '']))
  const remote = new Set<string>()
  const report: string[] = []
  employees.forEach((e, i) => {
    const raw = typeof e.workMode === 'string' ? e.workMode : ''
    const mode = workModeIn(raw)
    if (mode === null) report.push(`Employee ${i + 1}: work mode "${raw}" is not office or remote, so it stays office.`)
    if (mode !== 'remote') return
    const email = emailOf.get(id(e.userId))
    if (!email) {
      report.push(`Employee ${i + 1} is remote but has no Work login email to match, so it stays office.`)
      return
    }
    remote.add(email)
  })
  return { remote, report }
}

export type OldOfficeLocation = {
  _id?: unknown
  name?: unknown
  address?: unknown
  latitude?: unknown
  longitude?: unknown
  /** A number in the oldest records; later { mobile, desktop, default }. */
  radius?: unknown
  isActive?: unknown
}

const num = (value: unknown): number | undefined => (typeof value === 'number' && Number.isFinite(value) ? value : undefined)

/** The old phone and desktop radii, as VistaarOS read them (lib/officeLocationUtils getRadiusConfig). */
function oldRadii(radius: unknown): { phone: number; laptop: number } {
  if (typeof radius === 'number') return { phone: radius, laptop: DEFAULT_LAPTOP_RADIUS_M }
  const r = (radius && typeof radius === 'object' ? radius : {}) as Record<string, unknown>
  return { phone: num(r.mobile) ?? num(r.default) ?? DEFAULT_RADIUS_M, laptop: num(r.desktop) ?? DEFAULT_LAPTOP_RADIUS_M }
}

const clamp = (m: number) => Math.min(MAX_RADIUS_M, Math.max(MIN_RADIUS_M, Math.round(m)))
const metres = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`)

/**
 * Old office locations → Flowbit offices: the old id is kept, the phone circle is the old mobile radius and the
 * laptop circle the old desktop one. VistaarOS allowed 10 m to 10 km; Flowbit allows 25 m to 5 km, so radii outside
 * that are moved to the nearest limit and reported. Offices without a name or a real point are skipped and reported.
 */
export function officesFromOld(locations: readonly OldOfficeLocation[]): { offices: Office[]; report: string[] } {
  const report: string[] = []
  const rows = locations.flatMap((l, i) => {
    const name = typeof l.name === 'string' ? l.name.trim() : ''
    const label = name || `Office ${i + 1}`
    const point = { lat: num(l.latitude) ?? Number.NaN, lng: num(l.longitude) ?? Number.NaN }
    if (!name) {
      report.push(`${label}: no name, skipped.`)
      return []
    }
    if (!isValidPoint(point) || (point.lat === 0 && point.lng === 0)) {
      report.push(`${label}: no valid map pin, skipped. Add it again in HR settings → Offices.`)
      return []
    }
    const { phone, laptop } = oldRadii(l.radius)
    const radiusM = clamp(phone)
    const laptopRadiusM = Math.max(radiusM, clamp(laptop))
    if (radiusM !== Math.round(phone)) report.push(`${label}: phone circle ${metres(phone)} → ${metres(radiusM)} (Flowbit allows ${MIN_RADIUS_M} m to ${metres(MAX_RADIUS_M)}).`)
    if (laptopRadiusM !== Math.round(laptop)) report.push(`${label}: laptop circle ${metres(laptop)} → ${metres(laptopRadiusM)}${laptopRadiusM === radiusM && laptop < phone ? ' (never smaller than the phone circle)' : ` (Flowbit allows up to ${metres(MAX_RADIUS_M)})`}.`)
    const address = typeof l.address === 'string' ? l.address : undefined
    if (address && address.trim().length > 300) report.push(`${label}: address shortened to 300 characters.`)
    return [{ id: id(l._id) || undefined, name, address, lat: point.lat, lng: point.lng, radiusM, laptopRadiusM, active: l.isActive !== false }]
  })
  if (rows.length > MAX_OFFICES) report.push(`${rows.length} offices: Flowbit keeps the first ${MAX_OFFICES}; add the others by hand or remove some old ones.`)
  return { offices: cleanOffices(rows), report }
}
