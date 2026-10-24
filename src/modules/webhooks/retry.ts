/** Retry schedule of a failed delivery: 1 min, 5 min, 30 min, 2 h, 6 h, then it is marked failed. Pure. */

export const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 3_600_000, 6 * 3_600_000] as const
export const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1

/** When to try again after `attempts` tries, or null when it is out of tries. */
export function nextAttemptAfter(attempts: number, now: Date): Date | null {
  const delay = RETRY_DELAYS_MS[attempts - 1]
  return attempts < MAX_ATTEMPTS && delay != null ? new Date(now.getTime() + delay) : null
}

/** 2xx delivered; 4xx except 408/429 are permanent (the receiver refused); everything else retries. */
export function isRetryable(status: number | null): boolean {
  if (status == null) return true
  if (status >= 200 && status < 300) return false
  if (status === 408 || status === 429) return true
  return status >= 500
}
