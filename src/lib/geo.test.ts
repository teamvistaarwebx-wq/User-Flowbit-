import { describe, expect, it } from 'vitest'
import { cleanOffices, consentRecord, decidePunchGeo, geoSettingsOf, haversineMetres, LOCATION_NOTICE_VERSION, mapsUrl, nearestOffice, needsLocationConsent, type GeoSettings } from './geo'

const PUNE = { id: 'pune', name: 'Pune office', lat: 18.5204, lng: 73.8567, radiusM: 200, laptopRadiusM: 2500, active: true }
const MUMBAI = { id: 'mumbai', name: 'Mumbai office', lat: 19.076, lng: 72.8777, radiusM: 300, laptopRadiusM: 2500, active: true }
const settings = (extra: Partial<GeoSettings> = {}): GeoSettings => ({ mode: 'optional', outside: 'flag', offices: [PUNE, MUMBAI], ...extra })

describe('haversine distance', () => {
  it('is zero for the same point and symmetric', () => {
    expect(haversineMetres(PUNE, PUNE)).toBe(0)
    expect(haversineMetres(PUNE, MUMBAI)).toBeCloseTo(haversineMetres(MUMBAI, PUNE), 6)
  })
  it('matches known distances', () => {
    // Pune to Mumbai is about 120 km as the crow flies.
    expect(haversineMetres(PUNE, MUMBAI) / 1000).toBeGreaterThan(115)
    expect(haversineMetres(PUNE, MUMBAI) / 1000).toBeLessThan(125)
    // One thousandth of a degree of latitude is about 111 m.
    expect(haversineMetres({ lat: 18.52, lng: 73.85 }, { lat: 18.521, lng: 73.85 })).toBeCloseTo(111.2, 0)
  })
})

describe('geofence in/out', () => {
  it('finds the office the point is inside, else the nearest', () => {
    expect(nearestOffice({ lat: 18.5210, lng: 73.8567 }, [PUNE, MUMBAI])).toMatchObject({ office: PUNE, inside: true })
    expect(nearestOffice({ lat: 18.5304, lng: 73.8567 }, [PUNE, MUMBAI])).toMatchObject({ office: PUNE, inside: false })
    expect(nearestOffice({ lat: 0, lng: 0 }, [])).toBeNull()
  })
  it('counts the radius edge as inside', () => {
    const edge = { lat: 18.5204 + 0.0017, lng: 73.8567 } // about 189 m north
    expect(nearestOffice(edge, [PUNE])?.inside).toBe(true)
  })
  it('holds a rough (laptop) reading to the laptop circle, and only when it is precise enough for it', () => {
    const near = { lat: 18.5204 + 0.0108, lng: 73.8567 } // about 1.2 km north
    expect(nearestOffice(near, [PUNE], 40)).toMatchObject({ inside: false, rough: false, radiusM: 200 })
    expect(nearestOffice(near, [PUNE], 900)).toMatchObject({ inside: true, radiusM: 2500 })
    expect(nearestOffice(near, [PUNE], 3000)).toMatchObject({ inside: false, rough: true, radiusM: 2500 })
  })
  it('skips paused offices', () => {
    expect(nearestOffice({ lat: 18.521, lng: 73.8567 }, [{ ...PUNE, active: false }, MUMBAI], 20)).toMatchObject({ office: MUMBAI, inside: false })
    expect(nearestOffice({ lat: 18.521, lng: 73.8567 }, [{ ...PUNE, active: false }], 20)).toBeNull()
  })
})

describe('decidePunchGeo', () => {
  const inside = { lat: 18.5205, lng: 73.8568, accuracy: 18.4 }
  const outside = { lat: 18.55, lng: 73.86, accuracy: 30 }
  it('asks nothing when off, or for breaks', () => {
    expect(decidePunchGeo(settings({ mode: 'off' }), 'in', inside, true)).toEqual({ ok: true })
    expect(decidePunchGeo(settings({ mode: 'required' }), 'break_start', null, false)).toEqual({ ok: true })
  })
  it('lets an optional check-in go without a location, but not a required one', () => {
    expect(decidePunchGeo(settings(), 'in', null, false)).toEqual({ ok: true })
    expect(decidePunchGeo(settings({ mode: 'required' }), 'out', null, true)).toMatchObject({ ok: false, error: expect.stringContaining('check out') })
  })
  it('never stores a location without consent', () => {
    expect(decidePunchGeo(settings(), 'in', inside, false)).toEqual({ ok: false, error: 'Accept the location notice first.' })
  })
  it('stores the point, accuracy and inside result', () => {
    expect(decidePunchGeo(settings(), 'in', inside, true)).toEqual({ ok: true, geo: { lat: 18.5205, lng: 73.8568, accuracy: 18, inside: true, office: 'Pune office', distanceM: 15, radiusM: 200 } })
  })
  it('refuses a reading without its accuracy', () => {
    expect(decidePunchGeo(settings(), 'in', { lat: 18.5205, lng: 73.8568 }, true)).toEqual({ ok: false, error: 'That location could not be read. Try again.' })
  })
  it('says when a reading is too rough to confirm, rather than calling it far away', () => {
    const roughNear = { lat: 18.5214, lng: 73.8567, accuracy: 3200 }
    expect(decidePunchGeo(settings({ outside: 'block' }), 'in', roughNear, true)).toMatchObject({ ok: false, error: expect.stringContaining('too rough to confirm you are at Pune office') })
    expect(decidePunchGeo(settings(), 'in', roughNear, true)).toMatchObject({ ok: true, geo: { inside: false, radiusM: 2500 } })
  })
  it('flags or blocks a check-in outside every office', () => {
    expect(decidePunchGeo(settings(), 'in', outside, true)).toMatchObject({ ok: true, geo: { inside: false, office: 'Pune office' } })
    expect(decidePunchGeo(settings({ outside: 'block' }), 'in', outside, true)).toMatchObject({ ok: false, error: expect.stringContaining('outside its 200 m area') })
  })
  it('stores just the point when there are no offices', () => {
    expect(decidePunchGeo(settings({ offices: [] }), 'in', { lat: 12.97, lng: 77.59, accuracy: 25 }, true)).toEqual({ ok: true, geo: { lat: 12.97, lng: 77.59, accuracy: 25 } })
  })
  it('refuses impossible coordinates', () => {
    expect(decidePunchGeo(settings(), 'in', { lat: 91, lng: 0 }, true).ok).toBe(false)
  })
  it('never trusts an IP-sized guess: refused when required, dropped when optional', () => {
    const rough = { ...inside, accuracy: 919_354 }
    expect(decidePunchGeo(settings({ mode: 'required' }), 'in', rough, true)).toMatchObject({ ok: false, error: expect.stringContaining('919.4 km') })
    expect(decidePunchGeo(settings(), 'in', rough, true)).toEqual({ ok: true })
    // 5 km is still a reading, but too rough for even the laptop circle, so it is kept and flagged.
    expect(decidePunchGeo(settings({ mode: 'required' }), 'in', { ...inside, accuracy: 5000 }, true)).toMatchObject({ ok: true, geo: { inside: false, accuracy: 5000 } })
  })
})

describe('location consent', () => {
  it('is needed until accepted, and again when the notice changes', () => {
    expect(needsLocationConsent(null)).toBe(true)
    const now = new Date('2026-10-09T04:00:00Z')
    const consent = consentRecord(now)
    expect(consent).toEqual({ at: now, version: LOCATION_NOTICE_VERSION })
    expect(needsLocationConsent(consent)).toBe(false)
    expect(needsLocationConsent(consent, LOCATION_NOTICE_VERSION + 1)).toBe(true)
    expect(needsLocationConsent({ at: null, version: LOCATION_NOTICE_VERSION })).toBe(true)
  })
})

describe('settings', () => {
  it('cleans offices: trims, clamps the radius, drops bad rows', () => {
    expect(cleanOffices([{ name: ' HQ ', lat: '18.5', lng: '73.8', radiusM: '5' }, { name: '', lat: 1, lng: 1, radiusM: 100 }, { name: 'X', lat: 100, lng: 0, radiusM: 100 }, { name: 'Zero', lat: 0, lng: 0, radiusM: 100 }])).toEqual([{ id: 'o1', name: 'HQ', lat: 18.5, lng: 73.8, radiusM: 25, laptopRadiusM: 25, active: true }])
  })
  it('keeps an older office on its one circle, never lets the laptop circle be smaller, and keeps ids unique', () => {
    const [old, small, paused] = cleanOffices([
      { name: 'Old', lat: 18.5, lng: 73.8, radiusM: 200 },
      { id: 'a', name: 'Small', lat: 18.5, lng: 73.8, radiusM: 300, laptopRadiusM: 100, address: '  MG Road, Pune ' },
      { id: 'a', name: 'Paused', lat: 18.5, lng: 73.8, radiusM: 100, laptopRadiusM: 9000, active: false },
    ])
    expect(old).toMatchObject({ id: 'o1', radiusM: 200, laptopRadiusM: 200, active: true })
    expect(small).toMatchObject({ id: 'a', laptopRadiusM: 300, address: 'MG Road, Pune' })
    expect(paused).toMatchObject({ id: 'a-3', laptopRadiusM: 5000, active: false })
  })
  it('falls back to off and flag', () => {
    expect(geoSettingsOf(undefined)).toEqual({ mode: 'off', outside: 'flag', offices: [] })
    expect(geoSettingsOf({ mode: 'required', outside: 'nope' })).toMatchObject({ mode: 'required', outside: 'flag' })
  })
  it('links to Google Maps without a key', () => expect(mapsUrl({ lat: 18.5204, lng: 73.8567 })).toBe('https://www.google.com/maps?q=18.520400,73.856700'))
})
