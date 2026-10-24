import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { formatMonth, shiftMonth } from '@/lib/dates'
import { buildHref, type SearchParams } from '@/lib/list'

/** "‹ OCTOBER 2026 ›" as on the dashboard's attendance card, on the dark control pill (server component). */
export function MonthSwitcher({ month, basePath, params, param = 'month' }: { month: string; basePath: string; params: SearchParams; param?: string }) {
  const nav = 'inline-flex size-7 items-center justify-center rounded-full text-white transition-colors hover:bg-white/[0.08]'
  return (
    <div className="inline-flex h-9 items-center gap-1 rounded-full bg-control px-1 ring-1 ring-inset ring-white/[0.12]">
      <Link href={buildHref(basePath, params, { [param]: shiftMonth(month, -1) })} className={nav} aria-label="Previous month" scroll={false}>
        <ChevronLeft className="size-3.5" strokeWidth={1.75} />
      </Link>
      <span className="min-w-[7.5rem] text-center text-[13px] font-semibold uppercase tracking-[0.04em] tabular-nums text-white">{formatMonth(month)}</span>
      <Link href={buildHref(basePath, params, { [param]: shiftMonth(month, 1) })} className={nav} aria-label="Next month" scroll={false}>
        <ChevronRight className="size-3.5" strokeWidth={1.75} />
      </Link>
    </div>
  )
}
