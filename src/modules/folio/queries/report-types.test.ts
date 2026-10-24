import { describe, expect, test } from 'vitest'
import { reportParams } from './report-types'

describe('reportParams', () => {
  test('falls back to the default period on malformed dates', () => {
    const q: Record<string, string> = { from: 'abc', to: '2026-99-99' }
    const p = reportParams((k) => q[k], '2026-10-03')
    expect(p.from).toBe('2026-04-01')
    expect(p.to).toBe('2026-10-03')
  })
})
