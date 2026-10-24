import 'server-only'
import type { Model, Types } from 'mongoose'
import { dbConnect } from '@/lib/db'
import { scoped, type Scoped } from '@/lib/db/scoped'

/**
 * Deliberate cross-tenant access. Product code uses `ctx.db` (one org);
 * these handles are for the few places that must see across orgs:
 *   - the Console (Flowbit staff): `requireStaff()` / `consoleAction()` in
 *     lib/console/session hand out a StaffCtx built on `systemDb`;
 *   - system flows with no member yet (Razorpay webhook, invite lookup, cron): `elevated(reason, fn)`.
 * Raw models are reachable only through these handles, so every use names its reason.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyModel = Model<any>

export type SystemDb = {
  /** The unscoped model: every query sees every org. Add your own filters. */
  raw: <M extends AnyModel>(model: M) => M
  /** An org-scoped wrapper (same as ctx.db) for one workspace. */
  forOrg: (orgId: Types.ObjectId) => { db: <M extends AnyModel>(model: M) => Scoped<M> }
}

export const systemDb: SystemDb = {
  raw: (model) => model,
  forOrg: (orgId) => ({ db: (model) => scoped(model, orgId) }),
}

/**
 * Cross-org access for system flows that have no member context (webhooks,
 * token lookups). Logs the reason; never call it from code a member can steer
 * without checking their rights first.
 */
export async function elevated<T>(reason: string, fn: (db: SystemDb) => Promise<T>): Promise<T> {
  if (!reason.trim()) throw new Error('elevated() needs a reason')
  await dbConnect()
  console.info(`[elevated] ${reason}`)
  return fn(systemDb)
}
