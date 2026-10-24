import 'server-only'
import type { ExtensionStore } from '@/lib/console/roles'
import type { SystemDb } from '@/lib/platform'
import { ConsoleAccount } from '@/models/console/ConsoleAccount'

const isDuplicateKey = (error: unknown) => (error as { code?: number } | null)?.code === 11000

/**
 * ConsoleAccount.trialExtensions with a conditional $inc (V2-REVIEW C9): for
 * Sales the filter only matches a record with no extension yet, so of two
 * requests at the same moment exactly one updates (or inserts) it.
 */
export function consoleExtensionStore(db: Pick<SystemDb, 'raw'>): ExtensionStore {
  return {
    async claim(orgId, onlyFirst) {
      const filter = onlyFirst ? { orgId, $or: [{ trialExtensions: { $exists: false } }, { trialExtensions: { $lt: 1 } }] } : { orgId }
      try {
        const res = await db.raw(ConsoleAccount).updateOne(filter, { $inc: { trialExtensions: 1 } }, { upsert: true })
        return res.modifiedCount + res.upsertedCount > 0
      } catch (error) {
        // The record exists and already holds an extension: the upsert's insert hit the unique orgId.
        if (isDuplicateKey(error)) return false
        throw error
      }
    },
    async release(orgId) {
      await db.raw(ConsoleAccount).updateOne({ orgId, trialExtensions: { $gt: 0 } }, { $inc: { trialExtensions: -1 } })
    },
  }
}
