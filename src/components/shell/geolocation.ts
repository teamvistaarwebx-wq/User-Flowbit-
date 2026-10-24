import { MAX_ACCURACY_M, type GeoReading } from '@/lib/geo'

/** A reading this precise ends the wait at once. */
const GOOD_M = 50
/** A reading this precise ends the wait once nothing better comes for SETTLE_MS (a laptop's Wi-Fi fix rarely improves). */
const USABLE_M = 150
const SETTLE_MS = 3_000
/** The longest wait for a fix once the browser may read the location. */
const WARMUP_MS = 20_000
/** The longest wait while the browser's own "Allow location?" prompt is still open; answering it restarts WARMUP_MS. */
const PROMPT_MS = 60_000

const MESSAGES: Record<number, string> = {
  1: 'Location is blocked for Flowbit in this browser. Allow it in the site settings.',
  2: 'Your location could not be found. Check that location services are on.',
  3: 'Finding your location took too long.',
}

const metres = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`)

export type PositionResult = GeoReading | { error: string; cancelled?: true }

export type ReadOptions = {
  /** Each better reading's accuracy in metres, for a live "±40 m" while waiting. */
  onProgress?: (accuracy: number) => void
  /** Aborting stops the wait with `{ cancelled: true }`. */
  cancel?: AbortSignal
  /** Aborting stops the wait with the best reading so far ("Use this location"). */
  takeBest?: AbortSignal
}

type Geo = Pick<Geolocation, 'watchPosition' | 'clearWatch'>
type Permission = Pick<PermissionStatus, 'state' | 'addEventListener' | 'removeEventListener'>

/**
 * Watches the device position and settles on the best reading. Always finishes: on a precise fix, when the fix
 * stops improving, or at its own time limit, which (unlike the browser's `timeout`) also covers the browser's
 * permission prompt. A reading rougher than MAX_ACCURACY_M is refused, never sent.
 */
export function watchBestPosition(geo: Geo, permission: Permission | null, { onProgress, cancel, takeBest }: ReadOptions = {}): Promise<PositionResult> {
  return new Promise((resolve) => {
    if (cancel?.aborted) return resolve({ error: 'Cancelled.', cancelled: true })
    if (permission?.state === 'denied') return resolve({ error: MESSAGES[1] })

    let best: (GeoReading & { accuracy: number }) | null = null
    let lastError = 3
    let done = false
    let watchId: number | null = null
    let limit: ReturnType<typeof setTimeout> | undefined
    let settle: ReturnType<typeof setTimeout> | undefined

    const finish = (result: PositionResult) => {
      if (done) return
      done = true
      clearTimeout(limit)
      clearTimeout(settle)
      if (watchId !== null) geo.clearWatch(watchId)
      permission?.removeEventListener('change', onPermission)
      cancel?.removeEventListener('abort', onCancel)
      takeBest?.removeEventListener('abort', finishWithBest)
      resolve(result)
    }
    function finishWithBest() {
      if (!best) return finish({ error: MESSAGES[lastError] ?? 'Your location could not be read.' })
      if (best.accuracy > MAX_ACCURACY_M) return finish({ error: `Your location is too rough to use (about ${metres(best.accuracy)} off). Turn on location services and try again.` })
      finish(best)
    }
    function onCancel() {
      finish({ error: 'Cancelled.', cancelled: true })
    }
    function onPermission() {
      if (permission?.state === 'denied') finish({ error: MESSAGES[1] })
      else if (permission?.state === 'granted') wait(WARMUP_MS)
    }
    const wait = (ms: number) => {
      clearTimeout(limit)
      limit = setTimeout(finishWithBest, ms)
    }

    wait(permission?.state === 'prompt' ? PROMPT_MS : WARMUP_MS)
    permission?.addEventListener('change', onPermission)
    cancel?.addEventListener('abort', onCancel)
    takeBest?.addEventListener('abort', finishWithBest)

    watchId = geo.watchPosition(
      (pos) => {
        const reading = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: Math.round(pos.coords.accuracy) }
        if (!Number.isFinite(reading.lat) || !Number.isFinite(reading.lng) || !Number.isFinite(reading.accuracy)) return
        if (best && reading.accuracy >= best.accuracy) return
        best = reading
        onProgress?.(reading.accuracy)
        if (reading.accuracy <= GOOD_M) return finish(reading)
        clearTimeout(settle)
        if (reading.accuracy <= USABLE_M) settle = setTimeout(finishWithBest, SETTLE_MS)
      },
      // Only a refusal is final; "unavailable" and per-reading timeouts may still be followed by a fix.
      (err) => {
        lastError = err.code
        if (err.code === 1) finish({ error: MESSAGES[1] })
      },
      { enableHighAccuracy: true, timeout: WARMUP_MS, maximumAge: 0 },
    )
    if (done) geo.clearWatch(watchId)
  })
}

/** Reads the device position once for a punch or an office pin (watched briefly for a better fix, never tracked). */
export async function readPosition(options: ReadOptions = {}): Promise<PositionResult> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return { error: 'This browser cannot share a location.' }
  const permission = navigator.permissions ? await navigator.permissions.query({ name: 'geolocation' }).catch(() => null) : null
  return watchBestPosition(navigator.geolocation, permission, options)
}
