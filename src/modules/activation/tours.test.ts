import { describe, expect, it } from 'vitest'
import { TOURS, TOUR_KEYS, markSeen, placeTip, shouldAutoStart, tourForPath } from './tours'

describe('product tours', () => {
  it('has four to six steps per product', () => {
    for (const key of TOUR_KEYS) {
      expect(TOURS[key].length).toBeGreaterThanOrEqual(4)
      expect(TOURS[key].length).toBeLessThanOrEqual(6)
    }
  })
  it('picks the tour from the page', () => {
    expect(tourForPath('/app/work/tasks')).toBe('work')
    expect(tourForPath('/app/hr')).toBe('muster')
    expect(tourForPath('/app/folio/invoices/new')).toBe('folio')
    expect(tourForPath('/app')).toBeNull()
    expect(tourForPath('/app/workspace')).toBeNull()
  })
  it('starts once per person and remembers without repeats', () => {
    expect(shouldAutoStart('work', [])).toBe(true)
    expect(shouldAutoStart('work', ['work'])).toBe(false)
    expect(shouldAutoStart(null, [])).toBe(false)
    const seen = ['muster']
    expect(markSeen(seen, 'work')).toEqual(['muster', 'work'])
    expect(markSeen(['work'], 'work')).toEqual(['work'])
    expect(seen).toEqual(['muster'])
  })
  it('places the tip below, above, or centred, inside the screen', () => {
    const vp = { width: 400, height: 800 }
    const tip = { width: 300, height: 150 }
    expect(placeTip({ top: 100, left: 10, width: 50, height: 40 }, vp, tip)).toEqual({ top: 152, left: 12, side: 'below' })
    expect(placeTip({ top: 700, left: 300, width: 80, height: 60 }, vp, tip).side).toBe('above')
    expect(placeTip(null, vp, tip)).toEqual({ top: 325, left: 50, side: 'center' })
  })
})

describe('tour seen state survives a quick navigation (browser check 9 Oct)', () => {
  it('reads stored tours defensively and merges them with the server list', async () => {
    const { mergeSeen, parseStoredTours, shouldAutoStart, unsavedTours } = await import('./tours')
    expect(parseStoredTours('["work","nope","folio"]')).toEqual(['work', 'folio'])
    expect(parseStoredTours('not json')).toEqual([])
    expect(parseStoredTours('{"work":true}')).toEqual([])
    expect(parseStoredTours(null)).toEqual([])
    const seen = mergeSeen([], parseStoredTours('["work"]'))
    expect(shouldAutoStart('work', seen)).toBe(false)
    expect(unsavedTours(['orbit'], ['work', 'orbit'])).toEqual(['work'])
  })
})

describe('tour choice (R1 1.9)', () => {
  it('replays the first enabled product tour on Home, never a product the workspace lacks', async () => {
    const { replayTourFor } = await import('./tours')
    expect(replayTourFor('/app', ['muster', 'folio'])).toBe('muster')
    expect(replayTourFor('/app/settings', [])).toBeNull()
    expect(replayTourFor('/app/folio/invoices', ['work'])).toBe('folio')
  })
  it('gives employees on My HR their own tour, not the HR one', () => {
    expect(tourForPath('/app/me/attendance')).toBe('me')
    expect(TOURS.me.some((s) => /HR, by area/.test(s.title))).toBe(false)
  })
})
