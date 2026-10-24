import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { watchBestPosition } from './geolocation'

type Ok = (pos: { coords: { latitude: number; longitude: number; accuracy: number } }) => void
type Fail = (err: { code: number }) => void

/** A stand-in for navigator.geolocation that the test feeds readings into. */
function fakeGeo() {
  let ok: Ok = () => {}
  let fail: Fail = () => {}
  const geo = {
    cleared: false,
    watchPosition: vi.fn((success: Ok, error: Fail) => {
      ok = success
      fail = error
      return 7
    }),
    clearWatch: vi.fn(() => {
      geo.cleared = true
    }),
    fix: (accuracy: number, lat = 23.2336, lng = 77.4343) => ok({ coords: { latitude: lat, longitude: lng, accuracy } }),
    error: (code: number) => fail({ code }),
  }
  return geo
}

/** A stand-in for the geolocation PermissionStatus. */
function fakePermission(state: PermissionState) {
  const target = new EventTarget()
  return Object.assign(target, {
    state,
    answer(next: PermissionState) {
      this.state = next
      target.dispatchEvent(new Event('change'))
    },
  })
}

const read = (geo: ReturnType<typeof fakeGeo>, permission: ReturnType<typeof fakePermission> | null = null, options = {}) =>
  watchBestPosition(geo as unknown as Geolocation, permission, options)

describe('watchBestPosition', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('takes a precise fix at once', async () => {
    const geo = fakeGeo()
    const result = read(geo)
    geo.fix(30)
    await expect(result).resolves.toEqual({ lat: 23.2336, lng: 77.4343, accuracy: 30 })
    expect(geo.cleared).toBe(true)
  })

  it('keeps the best reading and settles once it stops improving', async () => {
    const geo = fakeGeo()
    const progress: number[] = []
    const result = read(geo, null, { onProgress: (m: number) => progress.push(m) })
    geo.fix(900)
    geo.fix(120.4)
    geo.fix(400)
    await vi.advanceTimersByTimeAsync(3_000)
    await expect(result).resolves.toMatchObject({ accuracy: 120 })
    expect(progress).toEqual([900, 120])
  })

  it('waits out a rough fix, then uses the best one at the time limit', async () => {
    const geo = fakeGeo()
    const result = read(geo)
    geo.fix(1800)
    await vi.advanceTimersByTimeAsync(19_999)
    expect(geo.cleared).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    await expect(result).resolves.toMatchObject({ accuracy: 1800 })
  })

  it('always finishes, even when the browser never answers', async () => {
    const geo = fakeGeo()
    const result = read(geo)
    await vi.advanceTimersByTimeAsync(20_000)
    await expect(result).resolves.toEqual({ error: 'Finding your location took too long.' })
    expect(geo.cleared).toBe(true)
  })

  it('refuses an IP-sized guess instead of sending it', async () => {
    const geo = fakeGeo()
    const result = read(geo)
    geo.fix(919_354)
    await vi.advanceTimersByTimeAsync(20_000)
    await expect(result).resolves.toEqual({ error: expect.stringContaining('919.4 km') })
  })

  it('stops at once on a refusal, but rides out passing errors', async () => {
    const geo = fakeGeo()
    const result = read(geo)
    geo.error(2)
    geo.error(3)
    geo.fix(40)
    await expect(result).resolves.toMatchObject({ accuracy: 40 })

    const blocked = fakeGeo()
    const refused = read(blocked)
    blocked.error(1)
    await expect(refused).resolves.toEqual({ error: expect.stringContaining('blocked') })
  })

  it('reports the last error when no fix ever came', async () => {
    const geo = fakeGeo()
    const result = read(geo)
    geo.error(2)
    await vi.advanceTimersByTimeAsync(20_000)
    await expect(result).resolves.toEqual({ error: expect.stringContaining('location services') })
  })

  it('gives the browser prompt longer, and restarts the clock once it is answered', async () => {
    const geo = fakeGeo()
    const permission = fakePermission('prompt')
    const result = read(geo, permission)
    await vi.advanceTimersByTimeAsync(45_000)
    expect(geo.cleared).toBe(false)
    permission.answer('granted')
    await vi.advanceTimersByTimeAsync(19_999)
    expect(geo.cleared).toBe(false)
    geo.fix(20)
    await expect(result).resolves.toMatchObject({ accuracy: 20 })
  })

  it('ends when the prompt is refused, and never starts when already blocked', async () => {
    const geo = fakeGeo()
    const permission = fakePermission('prompt')
    const result = read(geo, permission)
    permission.answer('denied')
    await expect(result).resolves.toEqual({ error: expect.stringContaining('blocked') })

    const untouched = fakeGeo()
    await expect(read(untouched, fakePermission('denied'))).resolves.toEqual({ error: expect.stringContaining('blocked') })
    expect(untouched.watchPosition).not.toHaveBeenCalled()
  })

  it('can be cancelled, or told to use the best reading so far', async () => {
    const geo = fakeGeo()
    const cancel = new AbortController()
    const result = read(geo, null, { cancel: cancel.signal })
    cancel.abort()
    await expect(result).resolves.toMatchObject({ cancelled: true })
    expect(geo.cleared).toBe(true)

    const other = fakeGeo()
    const takeBest = new AbortController()
    const taken = read(other, null, { takeBest: takeBest.signal })
    other.fix(640)
    takeBest.abort()
    await expect(taken).resolves.toMatchObject({ accuracy: 640 })
  })
})
