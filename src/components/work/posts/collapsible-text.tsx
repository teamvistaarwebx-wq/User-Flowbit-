'use client'

import { useLayoutEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

/**
 * Long post text, clamped to five lines in the feed with "Read more" to open
 * it in place (and "Show less" to fold it again). The button appears only
 * when the text really overflows.
 */
export function CollapsibleText({ text, className }: { text: string; className?: string }) {
  const ref = useRef<HTMLParagraphElement>(null)
  const [open, setOpen] = useState(false)
  const [overflows, setOverflows] = useState(false)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setOverflows(el.scrollHeight - el.clientHeight > 2)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [text])

  return (
    <div className={className}>
      <p ref={ref} className={cn('whitespace-pre-wrap break-words text-sm leading-relaxed text-white/80', !open && 'line-clamp-5')}>{text}</p>
      {overflows || open ? (
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="relative z-10 mt-1 text-[13px] font-medium text-link hover:underline">
          {open ? 'Show less' : 'Read more'}
        </button>
      ) : null}
    </div>
  )
}
