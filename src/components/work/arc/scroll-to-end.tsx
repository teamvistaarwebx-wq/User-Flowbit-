'use client'

import { useEffect, useRef } from 'react'

/** Scrolls the newest Arc answer into view when the thread grows. */
export function ScrollToEnd({ marker }: { marker: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [marker])
  return <div ref={ref} aria-hidden />
}
