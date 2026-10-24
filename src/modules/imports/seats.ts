import type { SeatNeed } from './types'

/**
 * Whether an import fits the plan's people limit (console spec 4.2: Free is 5
 * seats; a seat is a login or a Muster employee without one). Pure: the
 * preview warns with this; the confirm step enforces it with assertCapacity.
 */
export type SeatState = { seatLimit: number | null; seatsUsed: number | null; accountType?: string }

/** People the import adds: invites, plus employees on payroll who have no login yet. */
export const seatsAdded = (need: SeatNeed) => (need.logins ?? 0) + (need.employees ?? 0)

export function seatProblem(state: SeatState, need: SeatNeed): string | null {
  const adding = seatsAdded(need)
  if (!adding || state.seatLimit == null || state.seatsUsed == null) return null
  const left = Math.max(0, state.seatLimit - state.seatsUsed)
  if (adding <= left) return null
  const plan = state.accountType === 'free' ? `The Free plan covers ${state.seatLimit} people` : `Your plan covers ${state.seatLimit} people`
  return `${plan} and ${state.seatsUsed} are in use, so ${left === 0 ? 'no one more' : `only ${left} more`} can be added. This file adds ${adding}. Upgrade, start a trial, or import fewer people.`
}
