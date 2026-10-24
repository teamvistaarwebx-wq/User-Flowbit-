'use client'

import { useRef, type KeyboardEvent } from 'react'
import { nextRovingIndex, rovingTabIndex } from '@/lib/roving'

/**
 * Props for each option of a radio group so the group is a single tab stop
 * and arrow keys move focus and select (WAI-ARIA radio pattern).
 *   const itemProps = useRovingRadio(values, selected, select)
 *   <button role="radio" {...itemProps(i)} />
 */
export function useRovingRadio<T>(values: readonly T[], selected: T | undefined, onSelect: (value: T) => void) {
  const refs = useRef<(HTMLElement | null)[]>([])
  const selectedIndex = selected === undefined ? -1 : values.indexOf(selected)
  return (index: number) => ({
    ref: (el: HTMLElement | null) => {
      refs.current[index] = el
    },
    tabIndex: rovingTabIndex(index, selectedIndex),
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      const next = nextRovingIndex(index, event.key, values.length)
      if (next === null) return
      event.preventDefault()
      refs.current[next]?.focus()
      onSelect(values[next])
    },
  })
}
