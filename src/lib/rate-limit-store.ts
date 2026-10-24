import { dbConnect } from '@/lib/db'
import { RateLimit } from '@/models/RateLimit'
import type { RateLimitResult } from './rate-limit-memory'

/** The fixed window containing `now`: [start, end). */
export function fixedWindow(now: number, windowMs: number): { start: number; end: number } {
  const start = Math.floor(now / windowMs) * windowMs
  return { start, end: start + windowMs }
}

/**
 * Counts one attempt for `key` in MongoDB (one document per key and window,
 * removed by a TTL index when the window ends), so the limit holds across
 * every server instance. Over the limit once the count passes `limit`.
 */
export async function countAttempt(key: string, limit: number, windowMs: number, now = Date.now()): Promise<RateLimitResult> {
  await dbConnect()
  const { start, end } = fixedWindow(now, windowMs)
  // An equality upsert on _id: MongoDB retries the insert race itself.
  const doc = await RateLimit.findOneAndUpdate(
    { _id: `${key}@${start}` },
    { $inc: { count: 1 }, $setOnInsert: { key, expiresAt: new Date(end) } },
    { upsert: true, returnDocument: 'after', lean: true },
  )
  const count = doc?.count ?? 1
  return count > limit ? { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((end - now) / 1000)) } : { ok: true, retryAfterSeconds: 0 }
}

/** Whether `key` is already over `limit` in the current window, without counting an attempt. */
export async function peekAttempts(key: string, limit: number, windowMs: number, now = Date.now()): Promise<RateLimitResult> {
  await dbConnect()
  const { start, end } = fixedWindow(now, windowMs)
  const doc = await RateLimit.findOne({ _id: `${key}@${start}` }, { count: 1 }).lean()
  return (doc?.count ?? 0) > limit ? { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((end - now) / 1000)) } : { ok: true, retryAfterSeconds: 0 }
}

/** Deletes every stored window of `key`. */
export async function clearAttempts(key: string): Promise<void> {
  await dbConnect()
  await RateLimit.deleteMany({ key })
}

/**
 * Takes `units` from a budget of `limit` per window (a daily write cap): all
 * or nothing, so a 30-change batch never half-fits. True when taken.
 */
export async function takeUnits(key: string, units: number, limit: number, windowMs: number, now = Date.now()): Promise<boolean> {
  if (units <= 0) return true
  if (units > limit) return false
  await dbConnect()
  const { start, end } = fixedWindow(now, windowMs)
  const _id = `${key}@${start}`
  await RateLimit.updateOne({ _id }, { $setOnInsert: { key, count: 0, expiresAt: new Date(end) } }, { upsert: true })
  const res = await RateLimit.updateOne({ _id, count: { $lte: limit - units } }, { $inc: { count: units } })
  return res.modifiedCount === 1
}
