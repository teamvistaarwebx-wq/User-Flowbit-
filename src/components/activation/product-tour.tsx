'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { X } from 'lucide-react'
import { Button, IconButton } from '@/components/ui/button'
import { useShell } from '@/components/shell/shell-context'
import { markTourSeen } from '@/modules/activation/actions'
import { TOURS, TOURS_SEEN_STORAGE_KEY, markSeen, mergeSeen, parseStoredTours, placeTip, replayTourFor, shouldAutoStart, tourForPath, unsavedTours, type TourKey } from '@/modules/activation/tours'

/** Window event that Help → "Replay the tour" sends; the tour for the current page starts again. */
export const REPLAY_TOUR_EVENT = 'flowbit:replay-tour'
const START_DELAY_MS = 900
const TIP_WIDTH = 320
const PAD = 6

type Rect = { top: number; left: number; width: number; height: number }

/** Tours this browser already marked seen; storage can be missing or blocked, which reads as none. */
function storedTours(): TourKey[] {
  if (typeof window === 'undefined') return []
  try {
    return parseStoredTours(window.localStorage.getItem(TOURS_SEEN_STORAGE_KEY))
  } catch {
    return []
  }
}

function storeTours(seen: readonly string[]): void {
  try {
    window.localStorage.setItem(TOURS_SEEN_STORAGE_KEY, JSON.stringify(parseStoredTours(JSON.stringify(seen))))
  } catch {
    // Private mode or blocked storage: the server save still records it.
  }
}

/** Saves in the background; a save cut off by navigation is retried on the next page. */
const saveSeen = (key: TourKey) => {
  markTourSeen({ tour: key }).catch((error: unknown) => console.warn('[tour] could not save; will retry', error))
}

function measure(target?: string): Rect | null {
  if (!target) return null
  const el = [...document.querySelectorAll<HTMLElement>(`[data-tour="${target}"]`)].find((n) => n.getClientRects().length > 0 && n.getBoundingClientRect().width > 0)
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { top: r.top, left: r.left, width: r.width, height: r.height }
}

/**
 * A tiny in-house product tour: a spotlight ring around the target and a tooltip card with Back, Next and
 * Skip. Starts on a product's first visit, remembers per person (User.prefs.toursSeen) and replays from
 * Help. Keyboard: → / Enter next, ← back, Esc skip; focus moves to the card.
 */
export function ProductTour() {
  const shell = useShell()
  const pathname = usePathname()
  const productsKey = Object.entries(shell.products).filter(([, p]) => p.enabled).map(([k]) => k).join(',')
  const enabledProducts = useMemo(() => (productsKey ? productsKey.split(',') : []), [productsKey])
  // Seen on the server or in this browser: Skip followed by a quick navigation must not show it again.
  const [seen, setSeen] = useState<string[]>(() => mergeSeen(shell.user.toursSeen, storedTours()))
  const [tour, setTour] = useState<TourKey | null>(null)
  const [index, setIndex] = useState(0)
  const [rect, setRect] = useState<Rect | null>(null)
  const [tipHeight, setTipHeight] = useState(180)
  const card = useRef<HTMLDivElement>(null)
  const steps = tour ? TOURS[tour] : []
  const step = steps[index]

  const finish = useCallback((key: TourKey) => {
    setTour(null)
    setSeen((cur) => {
      const next = markSeen(cur, key)
      storeTours(next)
      return next
    })
    saveSeen(key)
  }, [])

  // Saves the server missed (the Skip request was aborted by a navigation) are sent again.
  useEffect(() => {
    for (const key of unsavedTours(shell.user.toursSeen, storedTours())) saveSeen(key)
  }, [shell.user.toursSeen])

  // First visit to a product page: start after the page settles.
  useEffect(() => {
    const key = tourForPath(pathname)
    if (tour || !shouldAutoStart(key, seen)) return
    const id = setTimeout(() => {
      setIndex(0)
      setTour(key)
    }, START_DELAY_MS)
    return () => clearTimeout(id)
  }, [pathname, seen, tour])

  // Help → Replay the tour.
  useEffect(() => {
    const replay = () => {
      const key = replayTourFor(window.location.pathname, enabledProducts)
      if (!key) return
      setIndex(0)
      setTour(key)
    }
    window.addEventListener(REPLAY_TOUR_EVENT, replay)
    return () => window.removeEventListener(REPLAY_TOUR_EVENT, replay)
  }, [enabledProducts])

  useLayoutEffect(() => {
    if (!step) return
    const update = () => {
      setRect(measure(step.target))
      if (card.current) setTipHeight(card.current.offsetHeight)
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [step])

  useEffect(() => {
    if (tour) card.current?.focus()
  }, [tour, index])

  if (!tour || !step) return null
  const last = index === steps.length - 1
  const next = () => (last ? finish(tour) : setIndex((i) => i + 1))
  const back = () => setIndex((i) => Math.max(0, i - 1))
  const viewport = { width: window.innerWidth, height: window.innerHeight }
  const width = Math.min(TIP_WIDTH, viewport.width - 24)
  const pos = placeTip(rect, viewport, { width, height: tipHeight })
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') finish(tour)
    else if (e.key === 'ArrowRight') next()
    else if (e.key === 'ArrowLeft') back()
  }

  return (
    <div className="fixed inset-0 z-[90]" aria-live="polite">
      {rect ? (
        <div aria-hidden className="pointer-events-none fixed rounded-[12px] shadow-[0_0_0_9999px_rgba(10,8,12,0.55)] ring-2 ring-[#C084FC] transition-all duration-300" style={{ top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 }} />
      ) : (
        <div aria-hidden className="fixed inset-0 bg-[rgba(10,8,12,0.55)]" />
      )}
      <div
        ref={card}
        role="dialog"
        aria-modal="false"
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
        tabIndex={-1}
        onKeyDown={onKey}
        className="card-solid fixed animate-scale-in rounded-[14px] p-4 shadow-2xl outline-none ring-1 ring-white/15"
        style={{ top: pos.top, left: pos.left, width }}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id="tour-title" className="text-[15px] font-semibold text-white">{step.title}</h2>
          <IconButton label="Skip the tour" size="sm" onClick={() => finish(tour)}><X className="size-4" /></IconButton>
        </div>
        <p id="tour-body" className="mt-1.5 text-sm leading-relaxed text-white/80">{step.body}</p>
        <div className="mt-4 flex items-center justify-between gap-2">
          <span className="text-xs tabular-nums text-fg-3">{index + 1} of {steps.length}</span>
          <div className="flex gap-2">
            {index > 0 ? <Button size="sm" variant="ghost" onClick={back}>Back</Button> : <Button size="sm" variant="ghost" onClick={() => finish(tour)}>Skip</Button>}
            <Button size="sm" variant="primary" onClick={next}>{last ? 'Done' : 'Next'}</Button>
          </div>
        </div>
      </div>
    </div>
  )
}
