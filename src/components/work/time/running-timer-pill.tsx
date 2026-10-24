'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { Square, Timer } from 'lucide-react'
import { useAction } from '@/components/ui/action-form'
import { stopTimer } from '@/modules/work/time/actions'
import { formatTimer, isLongTimer } from '@/modules/work/time/format'
import { LongTimerConfirm } from './long-timer-confirm'
import { announceTimerChange, TIMER_CHANGED_EVENT, type RunningTimer } from './timer-card'

const POLL_MS = 30_000

/**
 * Top-bar pill for a running timer (key/title + hh:mm:ss ticking, click opens
 * the task, square stops it). Renders nothing when no timer runs. For the shell.
 */
export function RunningTimerPill() {
  const [running, setRunning] = useState<RunningTimer | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/work/time/running', { cache: 'no-store' })
      if (res.ok) setRunning(((await res.json()) as { running: RunningTimer | null }).running)
    } catch {
      setRunning(null)
    }
  }, [])
  const [stop, stopping] = useAction(stopTimer, {
    onDone: () => {
      setRunning(null)
      announceTimerChange()
    },
  })

  useEffect(() => {
    void load()
    const poll = setInterval(load, POLL_MS)
    const onChange = () => void load()
    window.addEventListener(TIMER_CHANGED_EVENT, onChange)
    return () => {
      clearInterval(poll)
      window.removeEventListener(TIMER_CHANGED_EVENT, onChange)
    }
  }, [load])
  useEffect(() => {
    if (!running) return
    const tick = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(tick)
  }, [running])

  if (!running) return null
  const elapsed = (now - new Date(running.startedAt).getTime()) / 1000
  const long = isLongTimer(new Date(running.startedAt), new Date(now))
  const onStopped = () => {
    setRunning(null)
    announceTimerChange()
  }
  const stopButton = (
    <button type="button" onClick={long ? undefined : () => stop({})} disabled={stopping} aria-label="Stop timer" className="flex size-6 items-center justify-center rounded-full bg-control-active transition-colors hover:bg-[#FF4540]/25 hover:text-[#FF6A66]">
      <Square className="size-3" />
    </button>
  )
  return (
    <span className="inline-flex h-8 items-center gap-2 rounded-full border border-white/[0.18] bg-control pl-3 pr-1 text-[13px] text-white">
      <Timer className="size-3.5 shrink-0 text-[#AAA9AB]" aria-hidden />
      <Link href={running.taskId ? `/app/work/tasks/${running.taskId}` : '/app/work/time'} className="max-w-[160px] truncate transition-colors hover:text-blush">{running.label}</Link>
      <span className="font-semibold tabular-nums">{formatTimer(elapsed)}</span>
      {long ? <LongTimerConfirm minutes={Math.floor(elapsed / 60)} trigger={stopButton} onStopped={onStopped} /> : stopButton}
    </span>
  )
}
