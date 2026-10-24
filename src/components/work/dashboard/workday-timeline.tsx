'use client'

import { useEffect, useState } from 'react'
import { formatTime, minutesOfDayIST, parseHHMM, weekday } from '@/lib/dates'
import { computeDay, type OfficeHours, type Punch } from '@/lib/attendance-core'
import { cn } from '@/lib/utils'

export type WorkdayProps = {
  hours: OfficeHours
  punches: { type: Punch['type']; at: string }[]
  status: string | null
  workWeek: number[]
  today: string
  /** Server time as ISO, so the first client render matches; the bar then follows the clock. */
  nowIso?: string
}

const MINUTE_MS = 60_000
/** Hour labels closer than this (in % of the bar) to "now" or the half-day block are left out. */
const LABEL_GAP_PCT = 7

/** "10AM", "04PM" (Figma). */
const hourLabel = (h: number) => `${String(h % 12 === 0 ? 12 : h % 12).padStart(2, '0')}${h < 12 ? 'AM' : 'PM'}`
/** "01:24PM" for the moving now-label. */
const clockLabel = (m: number) => {
  const h = Math.floor(m / 60)
  return `${String(h % 12 === 0 ? 12 : h % 12).padStart(2, '0')}:${String(Math.floor(m % 60)).padStart(2, '0')}${h < 12 ? 'AM' : 'PM'}`
}

/**
 * Figma workday timeline: a 92px glass card holding a THICK 42px bar. The track is translucent white; the
 * gradient fills from the start of office hours to now, with a slow sheen and a lit rim at the "now" edge.
 * Hour labels sit inside the bar; the half-day hour is a solid violet block. Check-in and breaks are hairline
 * marks with tooltips, never dots.
 */
export function WorkdayTimeline({ hours, punches, status, workWeek, today, nowIso }: WorkdayProps) {
  const [now, setNow] = useState(() => (nowIso ? new Date(nowIso) : new Date()))
  useEffect(() => {
    // Catch up with the client clock right after hydration, then once a minute.
    const first = setTimeout(() => setNow(new Date()), 0)
    const id = setInterval(() => setNow(new Date()), MINUTE_MS)
    return () => {
      clearTimeout(first)
      clearInterval(id)
    }
  }, [])

  const start = parseHHMM(hours.start)
  const end = parseHHMM(hours.end)
  const span = Math.max(1, end - start)
  const at = (minutes: number) => Math.min(100, Math.max(0, ((minutes - start) / span) * 100))
  const nowMin = minutesOfDayIST(now)
  const nowPct = at(nowMin)
  const halfMin = start + hours.halfDayHours * 60
  const halfPct = at(halfMin)
  const day = computeDay({ punches, status }, hours, now)
  const sorted = [...punches].sort((a, b) => a.at.localeCompare(b.at))
  const firstIn = sorted.find((p) => p.type === 'in')
  const lastOut = [...sorted].reverse().find((p) => p.type === 'out')
  const breaks = sorted.flatMap((p, i) => {
    if (p.type !== 'break_start') return []
    const endAt = sorted.slice(i + 1).find((q) => q.type === 'break_end' || q.type === 'out')
    return [{ from: at(minutesOfDayIST(new Date(p.at))), to: endAt ? at(minutesOfDayIST(new Date(endAt.at))) : nowPct }]
  })
  const dayOff = status === 'weekoff' || status === 'holiday' || !workWeek.includes(weekday(today))
  const onLeave = status === 'leave'
  const showFill = !dayOff && !onLeave && nowPct > 0
  const inDay = showFill && nowPct < 100

  const startHour = Math.ceil(start / 60)
  const endHour = Math.floor(end / 60)
  const ticks = Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i).filter((h) => {
    const p = at(h * 60)
    if (h * 60 === start) return !inDay || nowPct > LABEL_GAP_PCT
    if (h * 60 === end) return !inDay || nowPct < 100 - LABEL_GAP_PCT
    if ((h - startHour) % 3 !== 0) return false
    return Math.abs(p - halfPct) > LABEL_GAP_PCT && (!inDay || Math.abs(p - nowPct) > LABEL_GAP_PCT)
  })

  const summary = dayOff
    ? 'Day off'
    : onLeave
      ? 'On leave today'
      : firstIn
        ? `Checked in at ${formatTime(firstIn.at)}${day.state === 'break' ? ', on a break' : lastOut && day.state === 'out' ? `, out at ${formatTime(lastOut.at)}` : ''}`
        : 'Not checked in yet'

  return (
    <section aria-label="Workday" className="glass @container rounded-[16px] bg-white/[0.05] px-[17px] pb-[24px] pt-[26px] lit-edge-bright">
      <div
        className="relative h-[42px] overflow-hidden rounded-[8px] bg-white/[0.17]"
        role="progressbar"
        aria-label={`Workday ${hourLabel(Math.floor(start / 60))} to ${hourLabel(Math.floor(end / 60))}. ${summary}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(showFill ? nowPct : 0)}
        title={summary}
      >
        {showFill ? (
          <div className="absolute inset-y-0 left-0 overflow-hidden rounded-[8px] bg-grad-progress transition-[width] duration-[600ms] ease-out" style={{ width: `${nowPct}%` }}>
            <span aria-hidden className="absolute inset-y-0 left-0 w-[120px] bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.14),transparent)] animate-[sheen_7s_var(--ease-in-out)_infinite]" />
            <span aria-hidden className="absolute inset-y-0 right-0 w-[3px] bg-[linear-gradient(180deg,rgba(255,255,255,0.15),rgba(220,200,240,0.55),rgba(255,255,255,0.15))]" />
            <span aria-hidden className="absolute inset-x-0 bottom-0 h-[10px] bg-[linear-gradient(0deg,color-mix(in_srgb,var(--orchid)_28%,transparent),transparent)]" />
          </div>
        ) : null}
        {breaks.map((b, i) => (
          <span key={i} title="Break" className="absolute inset-y-0 bg-black/30" style={{ left: `${b.from}%`, width: `${Math.max(0.6, b.to - b.from)}%` }} />
        ))}
        {firstIn ? <span title={`Checked in ${formatTime(firstIn.at)}`} className="absolute inset-y-[9px] w-px bg-white/70" style={{ left: `${at(minutesOfDayIST(new Date(firstIn.at)))}%` }} /> : null}

        {/* Half day: a solid block centred on the half-day hour (Figma 101 x 42, #5E4084). */}
        <span className="absolute inset-y-0 flex w-[84px] -translate-x-1/2 items-center justify-center rounded-[8px] bg-[#5E4084] text-[13px] font-semibold text-white @min-[560px]:w-[101px] @min-[560px]:text-sm" style={{ left: `clamp(50.5px, ${halfPct}%, calc(100% - 50.5px))` }}>
          Half Day
        </span>

        {ticks.map((h) => {
          const p = at(h * 60)
          const edge = h * 60 === start ? 'left' : h * 60 === end ? 'right' : 'mid'
          return (
            <span
              key={h}
              className={cn('pointer-events-none absolute inset-y-0 flex items-center text-sm font-medium tabular-nums', edge === 'left' ? 'pl-2 text-white/90' : 'text-white', edge === 'mid' && 'hidden -translate-x-1/2 @min-[560px]:flex', edge === 'right' && 'pr-[18px]')}
              style={edge === 'right' ? { right: 0 } : { left: `${p}%` }}
            >
              {dayOff || onLeave ? (edge === 'left' ? (dayOff ? 'Day off' : 'On leave') : hourLabel(h)) : hourLabel(h)}
            </span>
          )
        })}
        {inDay && Math.abs(nowPct - halfPct) > LABEL_GAP_PCT ? (
          <span className="pointer-events-none absolute inset-y-0 hidden items-center text-sm font-medium tabular-nums text-white @min-[560px]:flex" style={{ left: `calc(${nowPct}% - 10px)` }}>
            {clockLabel(nowMin)}
          </span>
        ) : null}
      </div>
    </section>
  )
}
