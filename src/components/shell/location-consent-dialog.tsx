'use client'

import { MapPin } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { LOCATION_NOTICE } from '@/lib/geo'
import { cn } from '@/lib/utils'

export type ConsentPrompt = { open: boolean; required: boolean; accept: () => void; decline: () => void }

/** The wait for a fix at check-in: `accuracy` is the best reading so far (null before the first one). */
export type LocatingPrompt = { open: boolean; accuracy: number | null; cancel: () => void; useNow: () => void }

const metres = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`)

/** Signal strength from the reading's accuracy: the label, its colour and how full the bar is. */
function signalOf(accuracy: number | null) {
  if (accuracy === null) return { label: 'Waiting for a signal…', tone: 'text-fg-2', bar: 'w-1/6 bg-fg-3' }
  if (accuracy <= 100) return { label: `Location found · ±${metres(accuracy)}`, tone: 'text-success', bar: 'w-full bg-success' }
  if (accuracy <= 500) return { label: `Improving · ±${metres(accuracy)}`, tone: 'text-warning', bar: 'w-3/5 bg-warning' }
  return { label: `Weak signal · ±${metres(accuracy)}`, tone: 'text-danger', bar: 'w-1/4 bg-danger' }
}

/** Shown while check-in or check-out waits for the device's location (geolocation readPosition), with live accuracy. */
export function LocatingDialog({ open, accuracy, cancel, useNow }: LocatingPrompt) {
  const signal = signalOf(accuracy)
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (next ? null : cancel())}
      size="sm"
      title={<span className="inline-flex items-center gap-2"><MapPin className="size-4 text-link" /> Getting your location</span>}
      description="If your browser asks, choose Allow."
      footer={
        <>
          <Button variant="ghost" onClick={cancel}>Cancel</Button>
          {accuracy !== null ? <Button variant="primary" onClick={useNow}>Use this location</Button> : null}
        </>
      }
    >
      <p className={cn('text-sm font-medium tabular-nums', signal.tone)} aria-live="polite">{signal.label}</p>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
        <div className={cn('h-full rounded-full transition-[width] duration-500', signal.bar)} />
      </div>
      <p className="mt-3 text-xs text-fg-3">Near a window or outside, the signal comes faster.</p>
    </Dialog>
  )
}

/** The notice shown before the first location read at check-in; the answer is recorded (lib/geo consent). */
export function LocationConsentDialog({ open, required, accept, decline }: ConsentPrompt) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (next ? null : decline())}
      size="sm"
      title={<span className="inline-flex items-center gap-2"><MapPin className="size-4 text-link" /> Location at check-in</span>}
      description={required ? 'Your workspace asks for your location when you check in or out.' : 'Your workspace can save your location when you check in or out. You can skip it.'}
      footer={
        <>
          <Button variant="ghost" onClick={decline}>{required ? 'Not now' : 'Skip location'}</Button>
          <Button variant="primary" onClick={accept}>I agree</Button>
        </>
      }
    >
      <p className="text-sm leading-relaxed text-white/85">{LOCATION_NOTICE}</p>
      <p className="mt-2 text-xs text-fg-3">Your browser will ask for permission next. Your answer here is saved with the date.</p>
    </Dialog>
  )
}
