import { Timer } from 'lucide-react'
import { formatDate, formatDuration } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { StatusPill } from '@/components/ui/badge'
import { buttonClass } from '@/components/ui/button-styles'
import { Progress } from '@/components/ui/progress'
import type { TimeEntryRow } from '@/modules/work/tasks/detail'
import Link from 'next/link'

/**
 * Time on the task: logged vs estimate and the latest entries. Timers and
 * entry editing live on the Time page (work-b); this links there.
 */
export function TimePanel({ taskId, entries, loggedMinutes, estimateMinutes, nameOf, canLog }: { taskId: string; entries: TimeEntryRow[]; loggedMinutes: number; estimateMinutes: number | null; nameOf: (id: string) => string; canLog: boolean }) {
  const logged = entries.length ? entries.reduce((s, e) => s + e.minutes, 0) : loggedMinutes
  const over = estimateMinutes ? logged > estimateMinutes : false
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={cn('text-sm text-fg-2', over && 'text-[#FF6A66]')}>
          Logged <span className="font-semibold tabular-nums text-white">{formatDuration(logged)}</span>
          {estimateMinutes ? <> of {formatDuration(estimateMinutes)}</> : null}
        </p>
        {canLog ? (
          <Link href={`/app/work/time?task=${taskId}`} className={buttonClass('secondary', 'sm')}>
            <Timer className="size-3.5" /> Track time
          </Link>
        ) : null}
      </div>
      {estimateMinutes ? <Progress value={(logged / estimateMinutes) * 100} tone={over ? 'danger' : undefined} /> : null}
      {entries.length === 0 ? (
        <p className="text-[13px] text-fg-2">No time logged yet.</p>
      ) : (
        <ul className="-mx-2">
          {entries.map((e) => (
            <li key={e.id} className="flex h-9 items-center gap-3 rounded-lg px-2 text-sm transition-colors hover:bg-white/[0.04]">
              <span className="w-24 shrink-0 text-[13px] tabular-nums text-[#979797]">{formatDate(e.date)}</span>
              <span className="min-w-0 flex-1 truncate text-fg-2">
                <span className="text-white">{nameOf(e.memberId)}</span>
                {e.note ? ` · ${e.note}` : ''}
              </span>
              <span className="font-medium tabular-nums text-white">{e.isRunning ? 'Running' : formatDuration(e.minutes)}</span>
              <StatusPill status={e.status} className="hidden sm:inline-flex" />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
