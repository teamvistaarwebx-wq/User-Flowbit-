'use client'

/**
 * Google Maps JavaScript API, loaded on first use (only the office editor uses it). The key is the browser key
 * NEXT_PUBLIC_GOOGLE_MAPS_API_KEY, public by nature, so it is restricted in Google Cloud to Flowbit's domains and
 * to only the Maps JavaScript API and Places API (New). Address ↔ coordinates goes through the server's own
 * Geocoding key (modules/muster/settings/geocode). Without a key, or when Google refuses it, callers fall back to
 * plain coordinates. Only the few calls Flowbit makes are typed here.
 */

export const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ?? ''
/** A map ID enables the draggable pin and the dark style; DEMO_MAP_ID works for trying it out. */
export const MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID?.trim() || 'DEMO_MAP_ID'

export type LatLngLiteral = { lat: number; lng: number }
type LatLngObject = { lat: () => number; lng: () => number }
export type LatLngLike = LatLngLiteral | LatLngObject
type Listener = { remove: () => void }

export type GMap = {
  setCenter: (c: LatLngLiteral) => void
  setZoom: (z: number) => void
  panTo: (c: LatLngLiteral) => void
  addListener: (event: 'click', fn: (e: { latLng?: LatLngObject | null }) => void) => Listener
}
export type GMarker = { position: LatLngLike | null | undefined; map: GMap | null; addListener: (event: 'dragend', fn: () => void) => Listener }
export type GCircle = { setCenter: (c: LatLngLiteral) => void; setRadius: (r: number) => void; setMap: (m: GMap | null) => void }
type Place = { fetchFields: (o: { fields: string[] }) => Promise<unknown>; location?: LatLngLike | null; formattedAddress?: string | null; displayName?: string | null }
export type Suggestion = { placePrediction: { placeId: string; text: { toString: () => string }; toPlace: () => Place } | null }

type Libraries = {
  maps: { Map: new (el: HTMLElement, opts: Record<string, unknown>) => GMap; Circle: new (opts: Record<string, unknown>) => GCircle }
  marker: { AdvancedMarkerElement: new (opts: Record<string, unknown>) => GMarker }
  places: {
    AutocompleteSessionToken: new () => object
    AutocompleteSuggestion: { fetchAutocompleteSuggestions: (req: Record<string, unknown>) => Promise<{ suggestions: Suggestion[] }> }
  }
}
type MapsNamespace = { importLibrary: <K extends keyof Libraries>(name: K) => Promise<Libraries[K]> }
type MapsWindow = Window & { google?: { maps?: MapsNamespace }; __flowbitMapsReady?: () => void; gm_authFailure?: () => void }

let loading: Promise<MapsNamespace> | null = null
let refused = false
const refusedListeners = new Set<() => void>()

/** Called when Google refuses the key (wrong domain, API not enabled, billing off); the map then shows the fallback. */
export function onMapsRefused(fn: () => void): () => void {
  if (refused) fn()
  refusedListeners.add(fn)
  return () => {
    refusedListeners.delete(fn)
  }
}

function load(): Promise<MapsNamespace> {
  if (loading) return loading
  loading = new Promise((resolve, reject) => {
    if (!MAPS_KEY) return reject(new Error('No Google Maps key is set.'))
    const w = window as MapsWindow
    if (w.google?.maps?.importLibrary) return resolve(w.google.maps)
    w.gm_authFailure = () => {
      refused = true
      refusedListeners.forEach((fn) => fn())
    }
    w.__flowbitMapsReady = () => (w.google?.maps ? resolve(w.google.maps) : reject(new Error('Google Maps did not start.')))
    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?${new URLSearchParams({ key: MAPS_KEY, v: 'weekly', loading: 'async', callback: '__flowbitMapsReady' })}`
    script.async = true
    script.onerror = () => {
      loading = null
      script.remove()
      reject(new Error('Google Maps could not load. Check the connection.'))
    }
    document.head.append(script)
  })
  return loading
}

export async function importLibrary<K extends keyof Libraries>(name: K): Promise<Libraries[K]> {
  if (refused) throw new Error('Google refused the Maps key.')
  return (await load()).importLibrary(name)
}

export const toLiteral = (p: LatLngLike): LatLngLiteral => (typeof p.lat === 'function' ? { lat: (p as LatLngObject).lat(), lng: (p as LatLngObject).lng() } : (p as LatLngLiteral))
