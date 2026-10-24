'use client'

import { toast as sonner, type ExternalToast } from 'sonner'
import { play } from '@/lib/sound'

/** Toasts with sound: success plays `success`, error plays `error`, info plays `pop`. */
export const toast = {
  success(message: string, opts?: ExternalToast) {
    play('success')
    return sonner.success(message, opts)
  },
  error(message: string, opts?: ExternalToast) {
    play('error')
    return sonner.error(message, opts)
  },
  info(message: string, opts?: ExternalToast) {
    play('pop')
    return sonner(message, opts)
  },
  /** Silent message (no sound). */
  message(message: string, opts?: ExternalToast) {
    return sonner(message, opts)
  },
  promise: sonner.promise,
  dismiss: sonner.dismiss,
}

export const CONNECTION_ERROR = 'Could not reach Flowbit. Check your connection and try again.'

/**
 * Wraps an async UI step (a transition or click handler). A thrown error, such
 * as a dropped connection, a rejected upload or a deploy mid-request, becomes
 * an error toast instead of replacing the page with the error boundary.
 */
export function guard(run: () => Promise<void>, message = CONNECTION_ERROR): () => Promise<void> {
  return async () => {
    try {
      await run()
    } catch (error) {
      console.error('[ui] step failed', error)
      toast.error(message)
    }
  }
}
