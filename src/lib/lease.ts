import { dbConnect } from '@/lib/db'
import { CronLock } from '@/models/CronLock'

/** Longer than any run may take (maxDuration 300 s), so a crashed run frees the lease on its own. */
export const LEASE_MS = 15 * 60_000

const isDuplicateKey = (error: unknown) => (error as { code?: number } | null)?.code === 11000

export type LeaseOutcome<T> = { ran: true; result: T } | { ran: false }

/**
 * Runs `fn` while holding the named lease (a CronLock row). Returns
 * `{ ran: false }` when another run holds it: overlapping cron deliveries, or
 * a button pressed while the scheduled job is doing the same work.
 */
export async function withLease<T>(name: string, fn: () => Promise<T>): Promise<LeaseOutcome<T>> {
  await dbConnect()
  const now = new Date()
  try {
    await CronLock.findOneAndUpdate(
      { _id: name, $or: [{ lockedUntil: null }, { lockedUntil: { $lte: now } }] },
      { $set: { lockedUntil: new Date(now.getTime() + LEASE_MS), startedAt: now } },
      { upsert: true },
    )
  } catch (error) {
    if (isDuplicateKey(error)) return { ran: false }
    throw error
  }
  const release = (lastOk: boolean) => CronLock.updateOne({ _id: name }, { $set: { lockedUntil: null, finishedAt: new Date(), lastOk } })
  try {
    const result = await fn()
    await release(true)
    return { ran: true, result }
  } catch (error) {
    await release(false).catch((releaseError) => console.error(`[lease ${name}] could not release`, releaseError))
    throw error
  }
}
