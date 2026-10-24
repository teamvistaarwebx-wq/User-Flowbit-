'use client'

import { useCallback, useSyncExternalStore } from 'react'
import { setSoundPrefAction } from '@/lib/core-actions'
import { INITIAL_GATE, gate, type GateState, type SoundName } from './sound-gate'
import { createGraph, render, type Graph, type PlayOptions } from './sound-synth'

/**
 * Flowbit's sounds: few, quiet, short. Synthesised in `sound-synth` (no files).
 *   click    a soft, dry tick: a real action was pressed (not navigation)
 *   toggle   a two-stage tok: a switch, chip or checkbox changed (on rises, off falls)
 *   pop      a glassy, airy open: a dialog or menu opened
 *   success  a warm two-note rise: it worked
 *   error    a muted, low double knock: it did not
 *   notify   a soft glass bell: something new for you
 *   whoosh   an air sweep: a page-level moment (finishing setup, switching workspace)
 *
 * Nothing plays before the visitor's first pointer or key press (so never on
 * page load), the AudioContext is created and resumed lazily on that press,
 * and rapid repeats are dropped by `sound-gate`. The on/off choice is stored per
 * user (User.prefs.sound) and cached in localStorage. It is independent of the
 * reduced-motion preference.
 */

export type { SoundName, PlayOptions }

const STORAGE_KEY = 'fb:sound'
const UNLOCK_EVENTS = ['pointerdown', 'keydown', 'touchstart'] as const

let graph: Graph | null = null
let enabled = readStored()
let unlocked = false
let gateState: GateState = INITIAL_GATE
const listeners = new Set<() => void>()

function readStored(): boolean {
  if (typeof window === 'undefined') return true
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== 'off'
  } catch {
    return true
  }
}

function writeStored(on: boolean) {
  try {
    window.localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off')
  } catch {
    // Storage can be blocked (private windows); the choice still holds for this tab.
  }
}

function hasInteracted(): boolean {
  if (unlocked) return true
  const activation = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation
  return activation?.hasBeenActive === true
}

/** The shared graph, created on first need and resumed if the browser suspended it. */
function output(): Graph | null {
  if (!graph) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    try {
      graph = createGraph(new Ctor())
    } catch (err) {
      console.warn('[sound] audio unavailable', err)
      return null
    }
  }
  if (graph.ctx.state === 'suspended') void graph.ctx.resume().catch(() => undefined)
  return graph.ctx.state === 'closed' ? null : graph
}

function unlock() {
  unlocked = true
  UNLOCK_EVENTS.forEach((type) => window.removeEventListener(type, unlock, true))
  if (enabled) output()
}

if (typeof window !== 'undefined') {
  UNLOCK_EVENTS.forEach((type) => window.addEventListener(type, unlock, { capture: true, passive: true }))
}

/**
 * Plays a sound when sounds are on and the visitor has interacted with the
 * page. Safe to call anywhere on the client; repeats inside a sound's gap are
 * dropped. `toggle` takes `{ on }` so switching off sounds different.
 */
export function play(name: SoundName, opts?: PlayOptions): void {
  if (!enabled || typeof window === 'undefined' || !hasInteracted()) return
  if (document.visibilityState === 'hidden' && name !== 'notify') return
  const result = gate(gateState, name, performance.now())
  if (!result.allowed) return
  gateState = result.state
  const out = output()
  if (!out) return
  try {
    render(out, name, opts)
  } catch (err) {
    console.warn('[sound] could not play', name, err)
  }
}

export const isSoundOn = () => enabled

/** Sets the local preference (no server call). Used to seed from User.prefs on load. */
export function setSoundLocal(on: boolean): void {
  if (enabled === on) return
  enabled = on
  writeStored(on)
  listeners.forEach((l) => l())
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** [soundOn, setSoundOn]: setSoundOn saves to the user's prefs and plays a toggle. */
export function useSoundPref(): [boolean, (on: boolean) => Promise<void>] {
  const on = useSyncExternalStore(subscribe, isSoundOn, () => true)
  const set = useCallback(async (next: boolean) => {
    setSoundLocal(next)
    if (next) play('toggle', { on: true })
    const res = await setSoundPrefAction({ sound: next })
    if (!res.ok) {
      setSoundLocal(!next)
      play('error')
    }
  }, [])
  return [on, set]
}
