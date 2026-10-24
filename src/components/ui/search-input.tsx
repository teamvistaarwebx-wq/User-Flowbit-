'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'
import { Loader2, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fieldBase } from './input'

const DEBOUNCE_MS = 300

/** Search box bound to a URL param (default `q`), debounced; resets `page`. */
export function SearchInput({ placeholder = 'Search…', param = 'q', className }: { placeholder?: string; param?: string; className?: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const search = useSearchParams()
  const urlValue = search.get(param) ?? ''
  const [value, setValue] = useState(urlValue)
  const [pending, startTransition] = useTransition()
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** Values this box wrote to the URL that have not landed yet, oldest first, so its own updates are not mistaken for outside ones. */
  const inFlight = useRef<string[]>([])

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  // A link that changes ?q (Clear filters, a chip's X, a quick-link pill) wins over the box and any pending keystroke.
  useEffect(() => {
    const own = inFlight.current.indexOf(urlValue)
    if (own !== -1) {
      inFlight.current = inFlight.current.slice(own + 1)
      return
    }
    inFlight.current = []
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    setValue(urlValue)
  }, [urlValue])

  const push = (next: string) => {
    timer.current = null
    // Read the params when the debounce fires, not when it started, so a view or filter change made meanwhile is kept.
    const params = new URLSearchParams(window.location.search)
    const before = params.get(param) ?? ''
    if (next.trim()) params.set(param, next.trim())
    else params.delete(param)
    params.delete('page')
    const after = params.get(param) ?? ''
    if (after !== before) inFlight.current = [...inFlight.current, after]
    const qs = params.toString()
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }))
  }

  const onChange = (next: string) => {
    setValue(next)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => push(next), DEBOUNCE_MS)
  }

  return (
    <div className={cn('relative w-full sm:w-72', className)}>
      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#AAA9AB]">
        {pending ? <Loader2 className="size-[18px] animate-spin" /> : <Search className="size-[18px]" />}
      </span>
      <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} className={cn(fieldBase, 'h-10 rounded-full border-[#535153] bg-transparent pl-11 pr-9 text-sm [&::-webkit-search-cancel-button]:hidden')} />
      {value ? (
        <button type="button" onClick={() => onChange('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-fg-3 hover:text-fg" aria-label="Clear search">
          <X className="size-3.5" />
        </button>
      ) : null}
    </div>
  )
}
