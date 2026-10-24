'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { ArrowUp, CirclePlus } from 'lucide-react'
import { ArcMark } from '@/components/ui/logo'

const CHIPS = [
  { label: 'Outline Flowbit', action: 'outline' },
  { label: 'Breakdown Task', action: 'breakdown' },
  { label: 'Progress Update', action: 'progress' },
] as const

/**
 * Figma Arc card: glass lit by a purple light from below, the arc.ai logo, three dark suggestion chips and the
 * big 80px ask pill (gradient glass, a blush lip along the bottom). Enter asks Arc (/app/arc?q=).
 */
export function ArcCard() {
  const router = useRouter()
  const [q, setQ] = useState('')
  const ask = () => {
    const term = q.trim()
    if (term) router.push(`/app/arc?q=${encodeURIComponent(term)}`)
  }
  return (
    <section aria-label="Arc" className="glass @container/arc relative flex h-full min-h-[340px] flex-col items-center overflow-hidden rounded-[10px] bg-white/[0.06] px-6 pb-[42px] pt-[56px] @min-[1000px]:min-h-[404px]">
      <span aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(90%_60%_at_30%_112%,var(--arc-glow),transparent_70%)]" />
      <span aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_45%_at_95%_105%,rgba(150,135,160,0.35),transparent_70%)]" />

      <div className="relative flex items-center gap-[9px]">
        <ArcMark size={32} />
        <span className="text-[28px] font-semibold leading-none tracking-[-0.01em] text-white">
          arc<span className="bg-[image:var(--grad-arc-word)] bg-clip-text text-transparent">.ai</span>
        </span>
      </div>

      <div className="relative mt-auto flex flex-wrap justify-center gap-x-2.5 gap-y-3 @min-[470px]/arc:gap-x-[25px]">
        {CHIPS.map((c) => (
          <Link key={c.action} href={`/app/arc?action=${c.action}`} className="press inline-flex h-10 items-center justify-center whitespace-nowrap rounded-full bg-control px-4 text-sm @min-[470px]/arc:w-[132px] @min-[470px]/arc:px-2 font-medium text-[#F1F1F1] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition-colors hover:bg-[#1f1f1f]">
            {c.label}
          </Link>
        ))}
      </div>

      <form
        className="edge-stroke relative mt-[31px] flex h-20 w-full max-w-[484px] items-center gap-3.5 rounded-full bg-[image:var(--grad-arc-pill)] pl-5 pr-3 backdrop-blur-[12px] [--stroke:linear-gradient(180deg,rgba(177,156,185,0.9)_0%,rgba(177,156,185,0.25)_45%,rgba(245,220,240,0.6)_80%,#F5DCF0_100%)]"
        onSubmit={(e) => {
          e.preventDefault()
          ask()
        }}
      >
        {/* The lit lip along the bottom edge. */}
        <span aria-hidden className="pointer-events-none absolute inset-x-6 -bottom-px h-[3px] rounded-full bg-[#F5DCF0] blur-[1.5px]" />
        <Link href="/app/arc" aria-label="Open Arc" className="shrink-0 text-white transition-opacity hover:opacity-80">
          <CirclePlus className="size-[22px]" strokeWidth={1.5} />
        </Link>
        <textarea
          name="q"
          rows={2}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              ask()
            }
          }}
          placeholder="Search your workspace in seconds. What do you want to find?"
          aria-label="Ask Arc"
          className="h-[40px] min-w-0 flex-1 resize-none bg-transparent text-sm leading-5 text-white placeholder:text-[#C1B8C4] focus:outline-none"
        />
        {q.trim() ? (
          <button type="submit" aria-label="Ask Arc" className="press flex size-9 shrink-0 items-center justify-center rounded-full bg-white/90 text-[#3B2A72] animate-scale-in">
            <ArrowUp className="size-4" strokeWidth={2} />
          </button>
        ) : null}
      </form>
    </section>
  )
}
