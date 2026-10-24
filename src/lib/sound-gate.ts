/**
 * Decides whether a sound may play now. Pure and immutable so it can be tested
 * without Web Audio.
 *
 * Two rules keep Flowbit quiet:
 *  1. Repeat gap: the same sound cannot fire again inside its own minimum gap
 *     (a double click, a held key, a chip group mashed).
 *  2. Masking: inside a short window, a quieter class of sound never plays on
 *     top of a more important one (a click right after a success is dropped).
 */

export type SoundName = 'click' | 'toggle' | 'success' | 'error' | 'notify' | 'pop' | 'whoosh'

export const SOUND_NAMES: readonly SoundName[] = ['click', 'toggle', 'pop', 'success', 'error', 'notify', 'whoosh']

/** Higher wins when two sounds land inside MASK_WINDOW_MS. */
export const SOUND_PRIORITY: Readonly<Record<SoundName, number>> = {
  click: 0,
  toggle: 1,
  pop: 2,
  whoosh: 3,
  success: 4,
  error: 4,
  notify: 4,
}

/** Minimum time between two plays of the same sound. */
export const MIN_GAP_MS: Readonly<Record<SoundName, number>> = {
  click: 45,
  toggle: 70,
  pop: 140,
  whoosh: 700,
  success: 450,
  error: 450,
  notify: 2500,
}

export const MASK_WINDOW_MS = 80

export type GateState = Readonly<{
  lastBySound: Readonly<Partial<Record<SoundName, number>>>
  lastAt: number
  lastPriority: number
}>

export const INITIAL_GATE: GateState = { lastBySound: {}, lastAt: Number.NEGATIVE_INFINITY, lastPriority: -1 }

export type GateResult = Readonly<{ allowed: boolean; state: GateState }>

/** Returns whether `name` may play at `now` (ms) and the next gate state. */
export function gate(state: GateState, name: SoundName, now: number): GateResult {
  const previous = state.lastBySound[name]
  if (previous !== undefined && now - previous < MIN_GAP_MS[name]) return { allowed: false, state }
  const masked = now - state.lastAt < MASK_WINDOW_MS && state.lastPriority > SOUND_PRIORITY[name]
  if (masked) return { allowed: false, state }
  return {
    allowed: true,
    state: { lastBySound: { ...state.lastBySound, [name]: now }, lastAt: now, lastPriority: SOUND_PRIORITY[name] },
  }
}

/** A multiplier in [1 - spread, 1 + spread] from a random number in [0, 1). */
export function jitter(random: number, spread: number): number {
  return 1 + (random * 2 - 1) * spread
}

/** Decibels to linear gain. */
export function dbToGain(db: number): number {
  return 10 ** (db / 20)
}
