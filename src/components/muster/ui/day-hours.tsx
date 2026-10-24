import { BREAK_LABEL, breakEntries, type BreakMinutes, type DayHours } from '@/lib/break-types'
import { formatDuration } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { BreakIcon } from './break-icon'

/** Break minutes per type as small icon + minutes chips ("🍴 40m · ☕ 15m"). */
export function BreakChips({ breaks, className }: { breaks: BreakMinutes; className?: string }) {
  const entries = breakEntries(breaks)
  if (!entries.length) return null
  return (
    <span className={cn('inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] tabular-nums text-fg-2', className)}>
      {entries.map(([type, minutes]) => (
        <span key={type} title={`${BREAK_LABEL[type]}: ${formatDuration(minutes)}`} className="inline-flex items-center gap-1">
          <BreakIcon type={type} className="size-3" />
          {formatDuration(minutes)}
          <span className="sr-only">{BREAK_LABEL[type]}</span>
        </span>
      ))}
    </span>
  )
}

/** "Effective 7h 10m · Payable 7h 40m" with the breaks per type; `live`: still checked in, so the minutes run to now. */
export function DayHoursLine({ hours, live = false, className }: { hours: DayHours; live?: boolean; className?: string }) {
  return (
    <span className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-2', className)}>
      <span className="tabular-nums">Effective <span className="text-white">{formatDuration(hours.effective)}</span></span>
      <span className="tabular-nums">Payable <span className="text-white">{formatDuration(hours.payable)}</span></span>
      <BreakChips breaks={hours.breaks} />
      {live ? <span className="text-fg-3" title="Still checked in: counted up to when this page was loaded">so far</span> : null}
    </span>
  )
}
