import { describe, expect, it } from 'vitest'
import { isPlausibleDate } from './due'

describe('isPlausibleDate', () => {
  it('rejects a half-typed year', () => {
    expect(isPlausibleDate('0002-10-05')).toBe(false)
    expect(isPlausibleDate('0202-10-05')).toBe(false)
  })

  it('accepts a complete date in range', () => {
    expect(isPlausibleDate('2026-10-05')).toBe(true)
  })

  it('rejects empty and malformed values', () => {
    expect(isPlausibleDate('')).toBe(false)
    expect(isPlausibleDate(null)).toBe(false)
    expect(isPlausibleDate('2026-1-5')).toBe(false)
  })
})
