'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { shiftMonth } from '@/lib/dates'
import { IconButton } from '@/components/ui/button'

/** ‹ OCTOBER 2026 › month switcher (the dashboard attendance card's style) that keeps the other URL params. */
export function MonthPicker({ month, label }: { month: string; label: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const search = useSearchParams()
  const go = (delta: number) => {
    const next = new URLSearchParams(search.toString())
    next.set('month', shiftMonth(month, delta))
    router.push(`${pathname}?${next.toString()}`, { scroll: false })
  }
  return (
    <div className="inline-flex h-9 items-center gap-1 rounded-full bg-control px-1 ring-1 ring-inset ring-white/[0.12]">
      <IconButton label="Previous month" size="sm" className="size-7" onClick={() => go(-1)} sound={false}>
        <ChevronLeft className="size-3.5" strokeWidth={1.75} />
      </IconButton>
      <span className="min-w-[7.5rem] text-center text-[13px] font-semibold uppercase tracking-[0.04em] tabular-nums text-white">{label}</span>
      <IconButton label="Next month" size="sm" className="size-7" onClick={() => go(1)} sound={false}>
        <ChevronRight className="size-3.5" strokeWidth={1.75} />
      </IconButton>
    </div>
  )
}
