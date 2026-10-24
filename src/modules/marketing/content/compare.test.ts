import { describe, expect, it } from 'vitest'
import { COMPARE_STATS, ENGINEERING, V2_ADDED } from './compare'
import { SECURITY_TOPICS } from './security'

const number = (value: string) => Number(value.replace(/[^\d]/g, ''))

describe('Flowbit 1 and 2 page', () => {
  it('shows every counted figure growing or holding, with how it was counted', () => {
    for (const s of COMPARE_STATS) {
      expect(s.how.length, s.label).toBeGreaterThan(20)
      if (/^\d/.test(s.v1) && /^\d/.test(s.v2)) expect(number(s.v2), s.label).toBeGreaterThanOrEqual(number(s.v1))
    }
    expect(V2_ADDED.length).toBeGreaterThan(3)
    expect(ENGINEERING.length).toBeGreaterThan(1)
  })

  it('never makes defensive or unprovable claims', () => {
    const text = JSON.stringify([COMPARE_STATS, V2_ADDED, ENGINEERING, SECURITY_TOPICS])
    expect(text).not.toMatch(/vibe|lines of code|ISO ?27001|SOC ?2|certified|unhackable|100% secure|military/i)
  })
})
