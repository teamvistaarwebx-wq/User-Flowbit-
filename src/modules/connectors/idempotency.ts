import { Types } from 'mongoose'
import type { Ctx } from '@/lib/ctx'
import { McpIdempotency } from '@/models/mcp/McpIdempotency'

/**
 * "This Slack message / email already made a task", claimed before the task
 * is created: the unique (orgId, key) index lets only one concurrent delivery
 * through. The claim first holds a placeholder record id; `settle` points it
 * at the task, `release` frees the key when creating the task failed.
 */

const DUPLICATE_KEY = 11000
const isDuplicateKey = (error: unknown) => (error as { code?: number } | null)?.code === DUPLICATE_KEY

export type IdempotencyClaim =
  | Readonly<{ claimed: true; settle: (recordId: Types.ObjectId, label: string) => Promise<void>; release: () => Promise<void> }>
  | Readonly<{ claimed: false; recordId: string | null }>

export async function claimIdempotencyKey(ctx: Pick<Ctx, 'db'>, key: string, model: string): Promise<IdempotencyClaim> {
  const placeholder = new Types.ObjectId()
  try {
    await ctx.db(McpIdempotency).create({ key, model, recordId: placeholder })
  } catch (error) {
    if (!isDuplicateKey(error)) throw error
    const seen = await ctx.db(McpIdempotency).findOne({ key }).lean()
    return { claimed: false, recordId: seen ? String(seen.recordId) : null }
  }
  return {
    claimed: true,
    settle: async (recordId, label) => {
      await ctx.db(McpIdempotency).updateOne({ key, recordId: placeholder }, { $set: { recordId, label } })
    },
    release: async () => {
      await ctx.db(McpIdempotency).deleteOne({ key, recordId: placeholder })
    },
  }
}

/** Runs `create` once per key: a duplicate delivery gets `{ duplicate }` back, a failed create frees the key. */
export async function onceForKey<T extends { _id: Types.ObjectId; title: string }>(ctx: Pick<Ctx, 'db'>, key: string | null, create: () => Promise<T>): Promise<{ created: T } | { duplicate: string | null }> {
  if (!key) return { created: await create() }
  const claim = await claimIdempotencyKey(ctx, key, 'Task')
  if (!claim.claimed) return { duplicate: claim.recordId }
  let created: T
  try {
    created = await create()
  } catch (error) {
    await claim.release().catch((releaseError: unknown) => console.error('[connectors] could not release an idempotency key', key, releaseError))
    throw error
  }
  await claim.settle(created._id, created.title)
  return { created }
}
