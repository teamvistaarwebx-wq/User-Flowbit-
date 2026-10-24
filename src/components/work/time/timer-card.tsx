'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Play, Square, Timer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CardHeader } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Input } from '@/components/ui/input'
import { Select, type SelectOption } from '@/components/ui/select'
import { useAction } from '@/components/ui/action-form'
import { formatDuration } from '@/lib/dates'
import { startTimer, stopTimer } from '@/modules/work/time/actions'
import { formatTimer, isLongTimer } from '@/modules/work/time/format'
import { LongTimerConfirm } from './long-timer-confirm'
import { WORKDAY_MINUTES } from '@/modules/work/tasks/constants'

export type RunningTimer = { id: string; startedAt: string; label: string; sub?: string; taskId?: string; note: string }

/** Window event fired after a timer starts or stops, so the top-bar pill updates without waiting for its poll. */
export const TIMER_CHANGED_EVENT = 'flowbit:timer-changed'
export const announceTimerChange = () => window.dispatchEvent(new Event(TIMER_CHANGED_EVENT))

/**
 * Live seconds since `startedAt`, ticking every second. The server and the first
 * client render read different clocks, so the clock texts opt out of the hydration check.
 */
function useElapsed(startedAt?: string) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!startedAt) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [startedAt])
  return startedAt ? Math.max(0, (now - new Date(startedAt).getTime()) / 1000) : 0
}

/**
 * The timer as a hero strip in the workday timeline's glass (radius 16, white 5%): the running clock, or the
 * start row, and today's logged time against an 8 h day as the thick 42px bar.
 */
export function TimerCard({ running, options, todayMinutes, locked, workdayMinutes = WORKDAY_MINUTES }: { running: RunningTimer | null; options: SelectOption[]; todayMinutes: number; locked: boolean; /** The workspace's own day of work (office hours less the break). */ workdayMinutes?: number }) {
  const elapsed = useElapsed(running?.startedAt)
  const [target, setTarget] = useState<string>()
  const [note, setNote] = useState('')
  const [runStart, starting] = useAction(startTimer, {
    onDone: () => {
      setNote('')
      announceTimerChange()
    },
  })
  const [runStop, stopping] = useAction(stopTimer, { onDone: announceTimerChange })
  const todayToDate = todayMinutes + Math.floor(elapsed / 60)

  return (
    <section className="glass rounded-[16px] bg-white/[0.05] px-[17px] pb-4 pt-[15px]">
      <CardHeader label="Timer" icon={<Timer />} actions={<span className="text-[13px] tabular-nums text-fg-2" suppressHydrationWarning>Today {formatDuration(todayToDate)}</span>} />
      {running ? (
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[32px] font-semibold leading-9 tracking-[-0.01em] text-white tabular-nums" suppressHydrationWarning>{formatTimer(elapsed)}</div>
            <p className="mt-1 truncate text-sm text-white/85">
              {running.taskId ? <Link className="transition-colors hover:text-blush" href={`/app/work/tasks/${running.taskId}`}>{running.label}</Link> : running.label}
              {running.sub ? <span className="text-fg-3"> · {running.sub}</span> : null}
            </p>
            {running.note ? <p className="mt-0.5 text-[13px] text-[#959596]">{running.note}</p> : null}
          </div>
          {running && isLongTimer(new Date(running.startedAt), new Date(new Date(running.startedAt).getTime() + elapsed * 1000)) ? (
            <LongTimerConfirm minutes={Math.floor(elapsed / 60)} onStopped={announceTimerChange} trigger={<Button variant="danger" icon={<Square className="size-4" />}>Stop</Button>} />
          ) : (
            <Button variant="danger" icon={<Square className="size-4" />} loading={stopping} onClick={() => runStop({})}>
              Stop
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <Select options={options} value={target} onValueChange={setTarget} placeholder={options.length ? 'Pick a task or project' : 'No open tasks or projects'} aria-label="Task or project" disabled={!options.length} />
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What are you working on? (optional)" maxLength={500} />
          <Button variant="primary" icon={<Play className="size-4" />} loading={starting} disabled={!target || locked} onClick={() => target && runStart({ target, note: note || undefined })}>
            Start timer
          </Button>
        </div>
      )}
      <Progress size="lg" className="mt-4" value={(todayToDate / workdayMinutes) * 100} label={`Today ${formatDuration(todayToDate)} of ${Math.round((workdayMinutes / 60) * 10) / 10}h`} />
      {locked && !running ? <p className="mt-3 text-[13px] text-warning">This week is submitted. Ask your manager to send it back to log more time.</p> : null}
    </section>
  )
}
