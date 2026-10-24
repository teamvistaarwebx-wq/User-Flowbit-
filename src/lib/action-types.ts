/** Result of every server action (client-safe type; see lib/actions.ts). */
export type ActionResult<T = void> =
  | { ok: true; message?: string; data?: T; redirect?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string>; code?: ActionErrorCode }

/**
 * Refusals the client handles specially. `free_seat_limit`: a 6th person on
 * Free, trial still available (prompt: Upgrade or Start trial);
 * `free_seat_limit_no_trial`: the same once the trial is used (Upgrade only).
 */
export type ActionErrorCode = 'free_seat_limit' | 'free_seat_limit_no_trial'

export const isSeatLimitCode = (code: string | undefined): code is ActionErrorCode => code === 'free_seat_limit' || code === 'free_seat_limit_no_trial'
