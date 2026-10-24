import { describe, expect, it } from 'vitest'
import { checkInPlace, formatDistance } from './check-in-place'

describe('where a check-in happened (My attendance)', () => {
  it('names the office when inside a geofence, with a rounded map link', () => {
    expect(checkInPlace({ lat: 28.613912, lng: 77.209023, inside: true, office: 'Delhi HQ' })).toEqual({ kind: 'office', office: 'Delhi HQ', distanceM: null, mapUrl: 'https://www.openstreetmap.org/?mlat=28.6139&mlon=77.209#map=17/28.6139/77.209' })
  })

  it('says how far outside the office it was', () => {
    expect(checkInPlace({ lat: 28.7, lng: 77.1, inside: false, office: 'Delhi HQ', distanceM: 1234.4 })).toMatchObject({ kind: 'outside', office: 'Delhi HQ', distanceM: 1234 })
    expect(formatDistance(1234)).toBe('1.2 km')
    expect(formatDistance(350)).toBe('350 m')
  })

  it('falls back to "recorded" without geofences, and shows nothing without a location', () => {
    expect(checkInPlace({ lat: 19.07, lng: 72.87 })).toMatchObject({ kind: 'recorded', mapUrl: expect.stringContaining('mlat=19.07') })
    expect(checkInPlace(null)).toBeNull()
    expect(checkInPlace({ accuracy: 20 })).toBeNull()
  })
})
