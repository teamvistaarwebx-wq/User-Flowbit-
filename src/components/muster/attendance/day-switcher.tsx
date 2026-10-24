import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { addDays, formatDate } from '@/lib/dates'
import { buildHref, first, type SearchParams } from '@/lib/list'
import { cn } from '@/lib/utils'

/** "‹ Fri, 2 Oct 2026 ›" plus a date field on the dark control pill; moves `?date=` and never past today (server component). */
export function DaySwitcher({ date, today, basePath, params }: { date: string; today: string; basePath: string; params: SearchParams }) {
  const nav = 'inline-flex size-7 items-center justify-center rounded-full text-white transition-colors hover:bg-white/[0.08]'
  const kept = Object.entries(params).filter(([k]) => k !== 'date')
  return (
    <div className="inline-flex h-9 items-center gap-1 rounded-full bg-control px-1 ring-1 ring-inset ring-white/[0.12]">
      <Link href={buildHref(basePath, params, { date: addDays(date, -1) })} className={nav} aria-label="Previous day" scroll={false}><ChevronLeft className="size-3.5" strokeWidth={1.75} /></Link>
      <form method="get" action={basePath} className="flex items-center">
        {kept.map(([k, v]) => <input key={k} type="hidden" name={k} value={first(v) ?? ''} />)}
        <label className="sr-only" htmlFor="sheet-date">Day</label>
        <input id="sheet-date" type="date" name="date" defaultValue={date} max={today} className="h-7 w-[8.5rem] rounded-full bg-transparent px-2 text-center text-[13px] font-semibold tabular-nums text-white [color-scheme:dark] focus:outline-none focus-visible:ring-1 focus-visible:ring-white/40" title={formatDate(date, { withWeekday: true })} />
        <button type="submit" className="sr-only">Go</button>
      </form>
      <Link href={buildHref(basePath, params, { date: addDays(date, 1) })} aria-disabled={date >= today} className={cn(nav, date >= today && 'pointer-events-none opacity-30')} aria-label="Next day" scroll={false}><ChevronRight className="size-3.5" strokeWidth={1.75} /></Link>
    </div>
  )
}
