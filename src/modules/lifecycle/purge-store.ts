import 'server-only'
import type { Types } from 'mongoose'
import { storage } from '@/lib/storage'
import { Org } from '@/models/Org'
import { StoredFile } from '@/models/StoredFile'
import { ORG_PERSONAL } from './org-tombstone'
import type { PurgeFilter, PurgeStore } from './purge'

/**
 * The purge's MongoDB side. Every call refuses a filter without an orgId: a
 * bug elsewhere must fail loudly, never turn into "delete everything".
 */

function guarded(filter: PurgeFilter): PurgeFilter {
  if (!filter.orgId) throw new Error('purge refused: a filter without orgId')
  return filter
}

const unsetOf = (fields: readonly string[]) => Object.fromEntries(fields.map((f) => [f, 1]))

export const mongoPurgeStore = (): PurgeStore => ({
  count: (c, filter) => c.model.countDocuments(guarded(filter)),
  deleteMany: async (c, filter) => (await c.model.deleteMany(guarded(filter))).deletedCount ?? 0,
  anonymise: async (c, filter, change) => {
    const update = { ...(Object.keys(change.set).length ? { $set: change.set } : {}), ...(change.unset.length ? { $unset: unsetOf(change.unset) } : {}) }
    if (!Object.keys(update).length) return c.model.countDocuments(guarded(filter))
    return (await c.model.updateMany(guarded(filter), update)).modifiedCount ?? 0
  },
  filePaths: async (orgId: Types.ObjectId) => (await StoredFile.find(guarded({ orgId }), { path: 1 }).lean()).map((f) => f.path),
  deleteFile: (path) => storage().delete(path),
  tombstone: async (orgId, now) => {
    await Org.updateOne(
      { _id: orgId },
      {
        $set: { name: 'Deleted workspace', slug: `deleted-${String(orgId)}`, status: 'deleted', deletedAt: now, purgedAt: now, enabledProducts: [] },
        $unset: unsetOf(ORG_PERSONAL),
      },
    )
  },
})
