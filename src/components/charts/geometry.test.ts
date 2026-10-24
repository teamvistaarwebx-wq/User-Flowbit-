import { describe, expect, it } from 'vitest'
import { smoothPath } from './geometry'

const ys = (d: string) => [...d.matchAll(/[\d.]+,([\d.-]+)/g)].map((m) => Number(m[1]))

describe('smoothPath', () => {
  it('never overshoots the points it passes through', () => {
    // A flat line at y=100 with one spike to y=0: the curve must stay within 0..100.
    const d = smoothPath([{ x: 0, y: 100 }, { x: 10, y: 0 }, { x: 20, y: 100 }, { x: 30, y: 100 }, { x: 40, y: 100 }])
    const all = ys(d)
    expect(Math.max(...all)).toBeLessThanOrEqual(100)
    expect(Math.min(...all)).toBeGreaterThanOrEqual(0)
  })
  it('handles empty and single points', () => {
    expect(smoothPath([])).toBe('')
    expect(smoothPath([{ x: 1, y: 2 }])).toBe('M1,2')
  })
})

describe('axisLabelShown (browser check 9 Oct: month labels ran together)', () => {
  it('prints every label when they fit', async () => {
    const { axisLabelShown } = await import('./geometry')
    const shown = axisLabelShown(6)
    expect([0, 1, 2, 3, 4, 5].every(shown)).toBe(true)
  })

  it('prints at most six of twelve months, evenly, starting with the first', async () => {
    const { axisLabelShown } = await import('./geometry')
    const shown = axisLabelShown(12)
    const printed = Array.from({ length: 12 }, (_, i) => i).filter(shown)
    expect(printed).toEqual([0, 2, 4, 6, 8, 10])
    expect(printed.length).toBeLessThanOrEqual(6)
  })

  it('never prints two neighbouring labels for longer series', async () => {
    const { axisLabelShown } = await import('./geometry')
    for (const n of [7, 9, 13, 18, 24, 31]) {
      const printed = Array.from({ length: n }, (_, i) => i).filter(axisLabelShown(n))
      expect(printed[0]).toBe(0)
      expect(printed.slice(1).every((v, i) => v - printed[i] > 1)).toBe(true)
      expect(printed.length).toBeLessThanOrEqual(7)
    }
  })
})
