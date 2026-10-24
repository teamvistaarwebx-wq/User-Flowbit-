import type { Model, Types } from 'mongoose'
import type { Scoped } from '@/lib/db/scoped'
import type { RoleKey } from '@/lib/permissions'

/* eslint-disable @typescript-eslint/no-explicit-any */

/** A seeded user (lean). */
export type SeedUser = { _id: Types.ObjectId; name: string; email: string }
/** A seeded member (lean). */
export type SeedMember = { _id: Types.ObjectId; orgId: Types.ObjectId; userId: Types.ObjectId; role: string; title?: string | null; department?: string | null }
export type SeedOrg = { _id: Types.ObjectId; name: string; slug: string; officeHours?: any; workWeek?: number[] }

/**
 * What scripts/seed.ts passes to each product's `modules/<product>/seed.ts`:
 *   export async function seed(ctx: SeedCtx): Promise<void>
 * Seed files may import models and pure helpers only (no 'server-only'
 * modules such as lib/ctx, lib/actions, lib/audit, lib/notify, lib/mail).
 */
export type SeedCtx = {
  orgId: Types.ObjectId
  org: SeedOrg
  /** One user per built-in role (owner = sanskaar@vistaarsws.com). */
  users: Record<RoleKey, SeedUser>
  /** The matching Member for each role. */
  members: Record<RoleKey, SeedMember>
  /** Every member of the demo org (owner, the role users and extra demo people). */
  allMembers: SeedMember[]
  /** Org-scoped model wrapper, same as ctx.db. */
  db: <M extends Model<any>>(model: M) => Scoped<M>
  log: (message: string) => void
}
