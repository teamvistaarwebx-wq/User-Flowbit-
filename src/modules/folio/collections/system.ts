import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { Types } from 'mongoose'
import { serverEnv } from '@/lib/env'
import type { SystemDb } from '@/lib/platform'
import { Member } from '@/models/Member'

/** The bearer token the scheduler sends: hex HMAC-SHA256(APP_SECRET, 'folio:cron'). */
export const cronToken = (): string => createHmac('sha256', serverEnv().APP_SECRET).update('folio:cron').digest('hex')

/** Constant-time check of an `Authorization: Bearer <token>` header (length checked first). */
export function isCronAuthorised(header: string | null): boolean {
  const given = Buffer.from((header ?? '').replace(/^Bearer\s+/i, '').trim())
  const expected = Buffer.from(cronToken())
  return given.length === expected.length && timingSafeEqual(given, expected)
}

/** The workspace owner's member id: scheduled drafts record them as creator. */
export async function ownerMemberId(db: SystemDb, orgId: Types.ObjectId): Promise<Types.ObjectId | null> {
  const member = await db.raw(Member).findOne({ orgId, role: 'owner', status: 'active' }, { _id: 1 }).sort({ joinedAt: 1 }).lean()
  return member?._id ?? null
}
