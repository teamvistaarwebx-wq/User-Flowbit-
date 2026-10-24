import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const { readGeocode } = await import('./geocode')

const hit = (lat: number, lng: number, address = 'Zone 2, MP Nagar, Bhopal, Madhya Pradesh 462011, India') => ({ formatted_address: address, geometry: { location: { lat, lng } } })

describe("reading Google's geocoding answer", () => {
  it('takes the first result with a real point', () => {
    expect(readGeocode({ status: 'OK', results: [hit(Number.NaN, 1), hit(23.2336, 77.4343)] })).toEqual({ point: { lat: 23.2336, lng: 77.4343 }, address: 'Zone 2, MP Nagar, Bhopal, Madhya Pradesh 462011, India' })
  })

  it('answers null when Google finds nothing', () => {
    expect(readGeocode({ status: 'ZERO_RESULTS', results: [] })).toBeNull()
    expect(readGeocode({ status: 'OK', results: [] })).toBeNull()
  })

  it('words a refused key, a used-up quota and other failures for HR', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => readGeocode({ status: 'REQUEST_DENIED', error_message: 'This API project is not authorized' })).toThrow(/Geocoding API is enabled/)
    expect(() => readGeocode({ status: 'OVER_QUERY_LIMIT' })).toThrow(/Google limit/)
    expect(() => readGeocode({ status: 'UNKNOWN_ERROR' })).toThrow(/did not work just now/)
    errors.mockRestore()
  })
})
