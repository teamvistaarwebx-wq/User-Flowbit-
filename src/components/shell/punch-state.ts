/**
 * The punch state every check-in surface reads (the side-panel card, the phone top bar's quick check-in and
 * their dials): the server's day plus an optimistic guess while a punch is in flight. The label, the button
 * and the dial all derive from `shownPunch`, so the dial starts its morph the moment the user clicks and rolls
 * back with the label if the server refuses. Pure and client-safe, so it is unit-tested on its own.
 */
import { allowedPunches, type PunchState, type PunchType, type TodayState } from '@/lib/attendance-core'
import type { BreakKey } from '@/lib/break-types'

export type PunchSync = Readonly<{
  /** The last day the server sent (page render or punch result). */
  confirmed: TodayState
  /** The predicted day while a punch is in flight; null otherwise. */
  optimistic: TodayState | null
  /** When the shown day's minutes were counted (ms); live counts add the minutes since. */
  countedAt: number
}>

export type PunchEvent = Readonly<
  | { type: 'server'; today: TodayState; at: number }
  | { type: 'predict'; today: TodayState; at: number }
  | { type: 'confirm'; today: TodayState; at: number }
  | { type: 'rollback'; at: number }
>

const STATE_AFTER: Record<PunchType, PunchState> = { in: 'in', break_start: 'break', break_end: 'in', out: 'out' }

export const initialPunch = (today: TodayState, at: number): PunchSync => ({ confirmed: today, optimistic: null, countedAt: at })

/** The day to draw: the in-flight guess when there is one, else the server's day. */
export const shownPunch = (sync: PunchSync): TodayState => sync.optimistic ?? sync.confirmed

/**
 * server: a fresh render; an in-flight guess stays shown until its punch settles.
 * predict: the guess is shown at once. confirm: the server's answer replaces it. rollback: back to the server's day.
 */
export function punchReducer(sync: PunchSync, event: PunchEvent): PunchSync {
  switch (event.type) {
    case 'server':
      return sync.optimistic ? { ...sync, confirmed: event.today } : { confirmed: event.today, optimistic: null, countedAt: event.at }
    case 'predict':
      return { ...sync, optimistic: event.today, countedAt: event.at }
    case 'confirm':
      return { confirmed: event.today, optimistic: null, countedAt: event.at }
    case 'rollback':
      return sync.optimistic ? { ...sync, optimistic: null, countedAt: event.at } : sync
  }
}

/** Worked and break minutes of a day, counted up to `now` from when they were last counted. */
export function liveMinutes(today: TodayState, countedAt: number, now: number): Readonly<{ worked: number; onBreak: number }> {
  const since = Math.max(0, (now - countedAt) / 60_000)
  return {
    worked: today.workedMinutes + (today.state === 'in' ? since : 0),
    onBreak: today.breakMinutes + (today.state === 'break' ? since : 0),
  }
}

/**
 * The day as it will be after a punch, guessed on the client: the new state from `at`, the allowed punches,
 * the running break's type, and the minutes counted up to the click (so the timer does not jump).
 */
export function predictPunch(today: TodayState, punch: Readonly<{ type: PunchType; breakType?: BreakKey; at: number; countedAt: number }>): TodayState {
  const { worked, onBreak } = liveMinutes(today, punch.countedAt, punch.at)
  const iso = new Date(punch.at).toISOString()
  const state = STATE_AFTER[punch.type]
  const endingBreak = today.state === 'break'
  const runningType: BreakKey = today.breakType ?? 'other'
  const breakByType = endingBreak ? { ...today.breakByType, [runningType]: (today.breakByType[runningType] ?? 0) + (onBreak - today.breakMinutes) } : today.breakByType
  return {
    ...today,
    state,
    stateSince: iso,
    workedMinutes: worked,
    breakMinutes: onBreak,
    breakByType,
    breakType: state === 'break' ? (punch.breakType ?? 'other') : null,
    firstIn: today.firstIn ?? (punch.type === 'in' ? iso : null),
    lastOut: punch.type === 'out' ? iso : today.lastOut,
    allowed: allowedPunches(state),
  }
}
