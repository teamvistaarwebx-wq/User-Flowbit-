import { describe, expect, it } from 'vitest'
import { nextRovingIndex, rovingTabIndex } from './roving'

describe('nextRovingIndex', () => {
  it('moves forward with right and down, wrapping at the end', () => {
    expect(nextRovingIndex(0, 'ArrowRight', 3)).toBe(1)
    expect(nextRovingIndex(2, 'ArrowDown', 3)).toBe(0)
  })

  it('moves back with left and up, wrapping at the start', () => {
    expect(nextRovingIndex(1, 'ArrowLeft', 3)).toBe(0)
    expect(nextRovingIndex(0, 'ArrowUp', 3)).toBe(2)
  })

  it('jumps to the ends with Home and End', () => {
    expect(nextRovingIndex(1, 'Home', 4)).toBe(0)
    expect(nextRovingIndex(1, 'End', 4)).toBe(3)
  })

  it('ignores other keys and empty groups', () => {
    expect(nextRovingIndex(0, 'Enter', 3)).toBeNull()
    expect(nextRovingIndex(0, 'ArrowRight', 0)).toBeNull()
  })
})

describe('rovingTabIndex', () => {
  it('gives the selected option the tab stop', () => {
    expect([0, 1, 2].map((i) => rovingTabIndex(i, 1))).toEqual([-1, 0, -1])
  })

  it('gives the first option the tab stop when nothing is selected', () => {
    expect([0, 1, 2].map((i) => rovingTabIndex(i, -1))).toEqual([0, -1, -1])
  })
})
