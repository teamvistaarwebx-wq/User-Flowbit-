import { isSeatLimitCode, type ActionResult } from '@/lib/action-types'

/**
 * Client-side bridge for Free's seat limit (console spec 4.2): ActionForm and
 * useAction hand a `free_seat_limit*` refusal to the LimitPrompt dialog in the
 * app shell instead of toasting it. Client-safe; a no-op on the server.
 */

export type LimitPromptDetail = { message: string; trialAvailable: boolean }

type Handler = (detail: LimitPromptDetail) => void
let handler: Handler | null = null

/** The app shell's LimitPrompt registers itself; returns the unregister function. */
export function registerLimitPrompt(next: Handler): () => void {
  handler = next
  return () => {
    if (handler === next) handler = null
  }
}

/** The prompt's content for a refused result, or null when it is an ordinary error. */
export function limitPromptOf(result: ActionResult<unknown>): LimitPromptDetail | null {
  if (result.ok || !isSeatLimitCode(result.code)) return null
  return { message: result.error, trialAvailable: result.code === 'free_seat_limit' }
}

/** Opens the prompt for a refused result; false when it is not a seat-limit refusal or no prompt is mounted (toast it instead). */
export function openLimitPrompt(result: ActionResult<unknown>): boolean {
  const detail = limitPromptOf(result)
  if (!detail || !handler) return false
  handler(detail)
  return true
}
