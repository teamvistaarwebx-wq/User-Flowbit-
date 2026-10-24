import type { ClientSession, Model } from 'mongoose'
import { touchesFrozen } from './rules'

/** The parts of a Mongoose query the frozen-field guard reads. */
export type GuardedQuery = {
  getUpdate: () => unknown
  getQuery: () => object
  getOptions: () => { session?: ClientSession | null }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  model: Model<any>
}

/**
 * Refuses an update query that touches a frozen field of any matched
 * document whose status is not `openStatus` (drafts for invoices).
 * Covers findOneAndUpdate, updateOne and updateMany.
 */
export async function guardFrozenUpdate(query: GuardedQuery, frozen: readonly string[], isLocked: (status: string) => boolean, message: (number: string | null) => string): Promise<void> {
  if (!touchesFrozen(query.getUpdate(), frozen)) return
  const targets = await query.model.find(query.getQuery()).select('status number').session(query.getOptions().session ?? null).lean<{ status: string; number?: string | null }[]>()
  const locked = targets.find((t) => isLocked(t.status))
  if (locked) throw new Error(message(locked.number ?? null))
}
