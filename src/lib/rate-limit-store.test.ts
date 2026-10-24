import { describe, expect, it } from 'vitest'
import { fixedWindow } from './rate-limit-store'

describe('fixed window', () => {
  it('aligns windows to multiples of their length', () => {
    const fifteen = 15 * 60_000
    const now = Date.UTC(2026, 9, 3, 10, 7, 30)
    expect(fixedWindow(now, fifteen)).toEqual({ start: Date.UTC(2026, 9, 3, 10, 0), end: Date.UTC(2026, 9, 3, 10, 15) })
    expect(fixedWindow(Date.UTC(2026, 9, 3, 10, 15), fifteen).start).toBe(Date.UTC(2026, 9, 3, 10, 15))
  })
})
