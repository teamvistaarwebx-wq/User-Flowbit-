'use client'

import { useEffect, useReducer, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Coffee, LogIn, LogOut, Play } from 'lucide-react'
import { punchAction, recordLocationConsentAction } from '@/lib/core-actions'
import { LOCATION_NOTICE_VERSION, type GeoReading } from '@/lib/geo'
import { readPosition } from './geolocation'
import type { ConsentPrompt, LocatingPrompt } from './location-consent-dialog'
import type { PunchType, TodayState } from '@/lib/attendance-core'
import type { BreakType } from '@/lib/break-types'
import { initialPunch, liveMinutes, predictPunch, punchReducer, shownPunch, type PunchEvent } from './punch-state'
import { play } from '@/lib/sound'
import { guard, toast } from '@/lib/toast'
import { useShell } from './shell-context'

const TICK_MS = 15_000

export const PUNCH_LABEL: Record<PunchType, string> = { in: 'Check in', break_start: 'Take break', break_end: 'Resume', out: 'Check out' }
export const PUNCH_ICON: Record<PunchType, typeof LogIn> = { in: LogIn, break_start: Coffee, break_end: Play, out: LogOut }

/** Every mounted usePunch (the side-panel card and the phone top bar) hears each punch's guess, answer or rollback. */
const listeners = new Set<(event: PunchEvent) => void>()
const broadcast = (event: PunchEvent) => listeners.forEach((listener) => listener(event))

/**
 * Today's punch state with a live worked/break count and the punch action. Shared by the side-panel check-in
 * card and the phone top bar's quick check-in, so both stay on the same server action and rules.
 * `refresh` re-reads the shell data after a punch, so the other copy (the drawer's card) shows the new state.
 */
export function usePunch({ refresh = false }: { refresh?: boolean } = {}) {
  const shell = useShell()
  const router = useRouter()
  // The label, the button and the dial all read `state`: the in-flight guess while a punch runs, else the server's day.
  const [sync, dispatch] = useReducer(punchReducer, shell.today, (today: TodayState) => initialPunch(today, Date.now()))
  const state = shownPunch(sync)
  const [now, setNow] = useState(() => Date.now())
  const [mounted, setMounted] = useState(false)
  // Plain state, not a transition: React holds a transition's state updates until its async work ends, so a
  // consent dialog or location wait opened from inside one would never show while the punch waits on it.
  const [pending, setPending] = useState(false)
  const running = useRef(false)

  useEffect(() => {
    dispatch({ type: 'server', today: shell.today, at: Date.now() })
  }, [shell.today])

  useEffect(() => {
    const listener = (event: PunchEvent) => {
      dispatch(event)
      setNow(event.at)
    }
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }, [])

  useEffect(() => {
    const first = setTimeout(() => {
      setMounted(true)
      setNow(Date.now())
    }, 0)
    const id = setInterval(() => setNow(Date.now()), TICK_MS)
    return () => {
      clearTimeout(first)
      clearInterval(id)
    }
  }, [])

  const geoMode = shell.checkInGeo.mode
  const consented = useRef(shell.checkInGeo.consented)
  const answer = useRef<((yes: boolean) => void) | null>(null)
  const [consentOpen, setConsentOpen] = useState(false)
  const askConsent = () => new Promise<boolean>((resolve) => {
    answer.current = resolve
    setConsentOpen(true)
  })
  const reply = (yes: boolean) => {
    setConsentOpen(false)
    answer.current?.(yes)
    answer.current = null
  }

  // The wait for a fix: the best accuracy so far, and the switches behind Cancel and "Use this location".
  const [locating, setLocating] = useState<{ accuracy: number | null } | null>(null)
  const wait = useRef<{ cancel: AbortController; takeBest: AbortController } | null>(null)
  const findPosition = async () => {
    const controls = { cancel: new AbortController(), takeBest: new AbortController() }
    wait.current = controls
    setLocating({ accuracy: null })
    try {
      return await readPosition({ onProgress: (accuracy) => setLocating({ accuracy }), cancel: controls.cancel.signal, takeBest: controls.takeBest.signal })
    } finally {
      wait.current = null
      setLocating(null)
    }
  }

  /** Check-in and check-out read the location once when the workspace asks for it; breaks never do. */
  const locate = async (type: PunchType): Promise<{ ok: boolean; geo?: GeoReading }> => {
    if (geoMode === 'off' || (type !== 'in' && type !== 'out')) return { ok: true }
    const required = geoMode === 'required'
    if (!consented.current) {
      if (!(await askConsent())) {
        if (required) toast.error('Your workspace needs your location to check in or out.')
        return { ok: !required }
      }
      const saved = await recordLocationConsentAction({ version: LOCATION_NOTICE_VERSION })
      if (!saved.ok) {
        toast.error(saved.error)
        return { ok: false }
      }
      consented.current = true
    }
    const pos = await findPosition()
    if ('cancelled' in pos) return { ok: false }
    if ('error' in pos) {
      toast.error(required ? pos.error : `${pos.error} Saved without a location.`)
      return { ok: !required }
    }
    return { ok: true, geo: pos }
  }

  const { worked, onBreak } = liveMinutes(state, sync.countedAt, now)

  /** Shows the guessed day at once, then the server's answer; a refusal or a lost connection rolls it back. */
  const send = async (type: PunchType, breakType: BreakType | undefined, geo: GeoReading | undefined) => {
    const at = Date.now()
    broadcast({ type: 'predict', today: predictPunch(state, { type, breakType, at, countedAt: sync.countedAt }), at })
    try {
      const res = await punchAction({ type, ...(breakType ? { breakType } : {}), ...(geo ? { geo } : {}) })
      if (!res.ok) {
        broadcast({ type: 'rollback', at: Date.now() })
        toast.error(res.error)
        return false
      }
      broadcast(res.data ? { type: 'confirm', today: res.data, at: Date.now() } : { type: 'rollback', at: Date.now() })
      toast.message(res.message ?? 'Saved')
      return true
    } catch (error) {
      broadcast({ type: 'rollback', at: Date.now() })
      throw error
    }
  }

  const run = (type: PunchType, breakType?: BreakType) => {
    if (running.current) return
    running.current = true
    setPending(true)
    void guard(async () => {
      try {
        const place = await locate(type)
        if (!place.ok) return
        if (!(await send(type, breakType, place.geo))) return
        play(type === 'in' ? 'success' : 'toggle')
        if (refresh) router.refresh()
      } finally {
        running.current = false
        setPending(false)
      }
    })()
  }

  const consent: ConsentPrompt = { open: consentOpen, required: geoMode === 'required', accept: () => reply(true), decline: () => reply(false) }
  const locatingPrompt: LocatingPrompt = {
    open: locating !== null,
    accuracy: locating?.accuracy ?? null,
    cancel: () => wait.current?.cancel.abort(),
    useNow: () => wait.current?.takeBest.abort(),
  }
  return { state, now, mounted, worked, onBreak, run, pending, remote: shell.checkInGeo.remote, breaks: shell.breaks, workdayMinutes: shell.workdayMinutes, disabled: pending || shell.access !== 'full', consent, locating: locatingPrompt }
}
