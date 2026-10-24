import 'server-only'
import { serverEnv } from '@/lib/env'
import { UserError } from '@/lib/errors'
import { isValidPoint, type LatLng } from '@/lib/geo'

/**
 * Office addresses ↔ coordinates through the Google Geocoding API, from the server only: the key
 * (GOOGLE_GEOCODING_API_KEY) never reaches the browser, and the actions in front of it check hr.settings
 * and a per-workspace rate limit. The browser key keeps only the map and the address suggestions.
 */

const ENDPOINT = 'https://maps.googleapis.com/maps/api/geocode/json'
const TIMEOUT_MS = 8_000

export type GeocodeHit = { point: LatLng; address: string }

type GeocodeResponse = {
  status?: string
  error_message?: string
  results?: { formatted_address?: string; geometry?: { location?: { lat?: number; lng?: number } } }[]
}

/** Google's answer → the first usable hit, null for "no result", or a UserError worded for HR. Pure, for tests. */
export function readGeocode(body: GeocodeResponse): GeocodeHit | null {
  if (body.status === 'ZERO_RESULTS') return null
  if (body.status === 'OVER_QUERY_LIMIT' || body.status === 'OVER_DAILY_LIMIT') throw new UserError('Address lookup has reached its Google limit for now. Drag the pin instead, or try later.')
  if (body.status === 'REQUEST_DENIED') {
    console.error('[geocode] Google refused the request:', body.error_message ?? 'no message')
    throw new UserError('Google refused the address lookup. Check that the Geocoding API is enabled for GOOGLE_GEOCODING_API_KEY.')
  }
  if (body.status !== 'OK') throw new UserError('Address lookup did not work just now. Drag the pin instead, or try again.')
  for (const r of body.results ?? []) {
    const point = { lat: Number(r.geometry?.location?.lat), lng: Number(r.geometry?.location?.lng) }
    if (isValidPoint(point)) return { point, address: r.formatted_address ?? '' }
  }
  return null
}

async function call(params: Record<string, string>): Promise<GeocodeHit | null> {
  const key = serverEnv().GOOGLE_GEOCODING_API_KEY
  if (!key) throw new UserError('Address lookup is not set up on this server (GOOGLE_GEOCODING_API_KEY). Drag the pin or enter the coordinates.')
  let body: GeocodeResponse
  try {
    const res = await fetch(`${ENDPOINT}?${new URLSearchParams({ ...params, key, region: 'in' })}`, { signal: AbortSignal.timeout(TIMEOUT_MS), cache: 'no-store' })
    body = (await res.json()) as GeocodeResponse
  } catch (error) {
    console.error('[geocode] request failed', error instanceof Error ? error.name : 'unknown')
    throw new UserError('Could not reach Google for the address. Drag the pin instead, or try again.')
  }
  return readGeocode(body)
}

/** A typed or pasted address → its point. `region=in` prefers Indian results without excluding others. */
export const geocodeAddress = (address: string) => call({ address })

/** A point → the nearest street address, for the "Pin near" check after the pin moves. */
export const addressNear = (point: LatLng) => call({ latlng: `${point.lat},${point.lng}` })
