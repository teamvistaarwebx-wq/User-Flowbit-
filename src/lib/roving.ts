/**
 * Roving tabindex for radio groups (WAI-ARIA radio pattern): the group is one
 * tab stop, arrow keys move between options and select them, Home and End jump
 * to the ends. Pure helpers; the React side is components/ui/use-roving-radio.
 */

const NEXT_KEYS = new Set(['ArrowRight', 'ArrowDown'])
const PREVIOUS_KEYS = new Set(['ArrowLeft', 'ArrowUp'])

/** The option index a key moves to (wrapping at the ends), or null when the key is not a roving key. */
export function nextRovingIndex(current: number, key: string, count: number): number | null {
  if (count <= 0) return null
  if (NEXT_KEYS.has(key)) return (current + 1) % count
  if (PREVIOUS_KEYS.has(key)) return (current - 1 + count) % count
  if (key === 'Home') return 0
  if (key === 'End') return count - 1
  return null
}

/** 0 for the one option that takes Tab focus (the selected one, or the first when none is), -1 for the rest. */
export const rovingTabIndex = (index: number, selectedIndex: number): 0 | -1 => (index === Math.max(selectedIndex, 0) ? 0 : -1)
