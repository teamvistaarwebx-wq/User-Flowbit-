/**
 * Pure logic behind the punch dial (punch-dial.tsx): which picture it shows for today's punches, how full
 * its ring is, the "07H 12MIN" timer text, the status line read to screen readers, and how it moves under
 * reduced motion. Client-safe, no React, so it is unit-tested on its own.
 */
import { parseHHMM } from '@/lib/dates'
import type { BreakKey, BreakPolicies } from '@/lib/break-types'
import type { MessageKey, Vars } from '@/lib/i18n'
import type { TodayState } from '@/lib/attendance-core'

export type DialVisual = Readonly<{ kind: 'idle' } | { kind: 'working' } | { kind: 'break'; breakType: BreakKey } | { kind: 'done' }>
export type DialKind = DialVisual['kind']
export type RingTone = 'work' | 'break' | 'warn' | 'over' | 'done' | 'none'
export type DialRing = Readonly<{ progress: number; tone: RingTone }>

/** A workday when the workspace's office hours cannot give one (10:00 to 19:00). */
export const DEFAULT_WORKDAY_MINUTES = 540
/** The break ring turns amber at this share of the type's daily limit. */
export const BREAK_WARN_AT = 0.8
/** The clock-to-icon morph (ms) and its spring-ish curve; reduced motion swaps at once. */
export const MORPH_MS = 520
export const MORPH_EASE = 'cubic-bezier(0.34, 1.45, 0.64, 1)'

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0)

/** Today's punches as the dial's picture: idle before the first check-in, the clock while working, the break's icon, done after checking out. */
export function dialVisual(today: Pick<TodayState, 'state' | 'breakType' | 'firstIn' | 'lastOut'>): DialVisual {
  if (today.state === 'in') return { kind: 'working' }
  if (today.state === 'break') return { kind: 'break', breakType: today.breakType ?? 'other' }
  return today.firstIn || today.lastOut ? { kind: 'done' } : { kind: 'idle' }
}

/** Minutes from office start to end (the work ring's full circle); an overnight or broken range falls back to 9 hours. */
export function workdayMinutes(hours: Readonly<{ start?: string; end?: string }> | null | undefined): number {
  if (!hours?.start || !hours.end) return DEFAULT_WORKDAY_MINUTES
  const span = parseHHMM(hours.end) - parseHHMM(hours.start)
  return span > 0 ? span : DEFAULT_WORKDAY_MINUTES
}

/** Worked minutes against the workday. */
export const workRing = (workedMinutes: number, dayMinutes: number): DialRing => ({ progress: clamp01(workedMinutes / Math.max(1, dayMinutes)), tone: 'work' })

/** Today's minutes of a break type against its daily limit: amber from 80%, red once past the limit. No limit (untyped break): an empty ring. */
export function breakRing(usedMinutes: number, limitMinutes: number | null): DialRing {
  if (!limitMinutes || limitMinutes <= 0) return { progress: 0, tone: 'break' }
  const share = Math.max(0, usedMinutes) / limitMinutes
  const tone: RingTone = share > 1 ? 'over' : share >= BREAK_WARN_AT ? 'warn' : 'break'
  return { progress: clamp01(share), tone }
}

/** The daily limit of a break key; none for an untyped break. */
export const breakLimit = (type: BreakKey, policies: BreakPolicies): number | null => (type === 'other' ? null : policies[type].limitMinutes)

/** The ring for a visual: work progress, break against its limit, a full done ring, nothing when idle. */
export function dialRing(visual: DialVisual, input: Readonly<{ workedMinutes: number; dayMinutes: number; breakUsedMinutes: number; policies: BreakPolicies }>): DialRing {
  switch (visual.kind) {
    case 'working':
      return workRing(input.workedMinutes, input.dayMinutes)
    case 'break':
      return breakRing(input.breakUsedMinutes, breakLimit(visual.breakType, input.policies))
    case 'done':
      return { progress: 1, tone: 'done' }
    default:
      return { progress: 0, tone: 'none' }
  }
}

const pad = (n: number) => String(n).padStart(2, '0')

/** "07H 12MIN": whole minutes, never negative. */
export function formatDialTime(minutes: number): string {
  const total = Number.isFinite(minutes) ? Math.max(0, Math.floor(minutes)) : 0
  return `${pad(Math.floor(total / 60))}H ${pad(total % 60)}MIN`
}

/** Minutes since an ISO time (the running break's own timer), never negative. */
export function minutesSince(iso: string | null, now: number): number {
  if (!iso) return 0
  const at = Date.parse(iso)
  return Number.isFinite(at) ? Math.max(0, (now - at) / 60_000) : 0
}

type T = (key: MessageKey, vars?: Vars) => string

/** The polite status line, e.g. "On break: Lunch Break, 12 minutes". */
export function dialStatus(visual: DialVisual, input: Readonly<{ workedMinutes: number; breakMinutes: number; ring: DialRing }>, t: T): string {
  const worked = Math.max(0, Math.floor(input.workedMinutes))
  const hm = { h: Math.floor(worked / 60), m: worked % 60 }
  switch (visual.kind) {
    case 'working':
      return t('dial.working', hm)
    case 'break': {
      const vars = { name: t(`break.${visual.breakType}`), m: Math.max(0, Math.floor(input.breakMinutes)) }
      return t(input.ring.tone === 'over' ? 'dial.breakOver' : 'dial.break', vars)
    }
    case 'done':
      return t('dial.done', hm)
    default:
      return t('dial.idle')
  }
}

export type DialMotion = Readonly<{ morphMs: number; loops: boolean; ease: string }>

/** Full motion morphs and loops; reduced motion swaps the picture at once and keeps everything still. */
export const dialMotion = (reduced: boolean): DialMotion => (reduced ? { morphMs: 0, loops: false, ease: 'linear' } : { morphMs: MORPH_MS, loops: true, ease: MORPH_EASE })

/** The user's choice (html[data-motion]) over the OS setting, as globals.css reads it. */
export function prefersReducedMotion(motion: string | undefined, osReduce: boolean): boolean {
  if (motion === 'reduce') return true
  if (motion === 'full') return false
  return osReduce
}

export type DialView = Readonly<{
  visual: DialVisual
  ring: DialRing
  status: string
  /** The big timer: worked time, or the running break's own time on a break. */
  timer: string
  /** Where the hands point: now, or the check-out time once done. */
  handsAt: number
}>

/**
 * Everything the dial and its card show, from today's punch state and the live counts of usePunch.
 * `worked` and `onBreak` already include the minutes since the server rendered.
 */
export function dialView(input: Readonly<{ today: TodayState; now: number; worked: number; onBreak: number; policies: BreakPolicies; dayMinutes: number }>, t: T): DialView {
  const { today, now } = input
  const visual = dialVisual(today)
  const liveBreak = Math.max(0, input.onBreak - today.breakMinutes)
  const breakUsedMinutes = visual.kind === 'break' ? (today.breakByType[visual.breakType] ?? 0) + liveBreak : 0
  const ring = dialRing(visual, { workedMinutes: input.worked, dayMinutes: input.dayMinutes, breakUsedMinutes, policies: input.policies })
  const breakElapsed = visual.kind === 'break' ? minutesSince(today.stateSince, now) : 0
  const status = dialStatus(visual, { workedMinutes: input.worked, breakMinutes: breakElapsed, ring }, t)
  const lastOut = visual.kind === 'done' && today.lastOut ? Date.parse(today.lastOut) : NaN
  return { visual, ring, status, timer: formatDialTime(visual.kind === 'break' ? breakElapsed : input.worked), handsAt: Number.isFinite(lastOut) ? lastOut : now }
}

/** Minutes of the break running now (from when it started), 0 when not on a break: the "Break 12m" label (R1 2.8). */
export function currentBreakMinutes(today: Pick<TodayState, 'state' | 'stateSince'>, now: number): number {
  if (today.state !== 'break' || !today.stateSince) return 0
  return Math.max(0, (now - Date.parse(today.stateSince)) / 60_000)
}
