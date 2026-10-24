/**
 * In-memory sliding-window limiter: the fast first check in front of the
 * shared MongoDB counter (lib/rate-limit). Per process, so on its own it does
 * not hold across serverless instances.
 */
const buckets = new Map<string, number[]>()
const MAX_KEYS = 50_000

export type RateLimitResult = { ok: boolean; retryAfterSeconds: number }

/**
 * Stores a key as the most recently used and evicts the least recently used
 * ones past MAX_KEYS. Never clears everything: a flood of new keys must not
 * reset the limits of keys under attack.
 */
function touch(key: string, times: number[]): void {
  buckets.delete(key)
  buckets.set(key, times)
  while (buckets.size > MAX_KEYS) {
    const oldest = buckets.keys().next().value
    if (oldest === undefined) break
    buckets.delete(oldest)
  }
}

export function memoryRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now()
  const recent = (buckets.get(key) ?? []).filter((t) => now - t < windowMs)
  if (recent.length >= limit) {
    touch(key, recent)
    return { ok: false, retryAfterSeconds: Math.ceil((windowMs - (now - recent[0])) / 1000) }
  }
  touch(key, [...recent, now])
  return { ok: true, retryAfterSeconds: 0 }
}

/** Whether `key` is at `limit` in this process, without counting an attempt. */
export function memoryPeek(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now()
  const recent = (buckets.get(key) ?? []).filter((t) => now - t < windowMs)
  return recent.length >= limit ? { ok: false, retryAfterSeconds: Math.ceil((windowMs - (now - recent[0])) / 1000) } : { ok: true, retryAfterSeconds: 0 }
}

/** Forgets every attempt counted in this process for `key`. */
export function clearMemoryRateLimit(key: string): void {
  buckets.delete(key)
}
