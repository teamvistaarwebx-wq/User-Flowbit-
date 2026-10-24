import 'server-only'
import type { Types } from 'mongoose'
import { ConsentLog } from '@/models/messaging/ConsentLog'
import { Suppression } from '@/models/messaging/Suppression'
import { CONSENT_NOTICE_VERSION, normalizeAddress, type ConsentSource, type SuppressionScope } from './consent'
import type { Channel } from './events'

/**
 * Writes to the suppression list and the consent log together, so every
 * opt-out (and opt-in) has its time, source and notice version (DPDP).
 */

export type ConsentChange = Readonly<{
  orgId: Types.ObjectId
  channel: Channel
  address: string
  source: ConsentSource
  scope?: SuppressionScope
  note?: string
  userId?: Types.ObjectId | null
  recordedBy?: Types.ObjectId | null
}>

/** Adds (or widens) a suppression and logs the opt-out. Idempotent per address and channel. */
export async function optOut(change: ConsentChange): Promise<void> {
  const address = normalizeAddress(change.channel, change.address)
  const scope = change.scope ?? 'non_essential'
  await Suppression.updateOne(
    { orgId: change.orgId, channel: change.channel, address },
    { $set: { source: change.source, note: change.note, ...(scope === 'all' ? { scope } : {}), ...(change.userId ? { userId: change.userId } : {}) }, $setOnInsert: scope === 'all' ? {} : { scope } },
    { upsert: true },
  )
  await ConsentLog.create({ orgId: change.orgId, channel: change.channel, address, action: 'opt_out', source: change.source, noticeVersion: CONSENT_NOTICE_VERSION, userId: change.userId ?? undefined, recordedBy: change.recordedBy ?? undefined, note: change.note })
}

/** Removes the suppression (the person opted back in) and logs it. */
export async function optIn(change: ConsentChange): Promise<void> {
  const address = normalizeAddress(change.channel, change.address)
  await Suppression.deleteOne({ orgId: change.orgId, channel: change.channel, address })
  await ConsentLog.create({ orgId: change.orgId, channel: change.channel, address, action: 'opt_in', source: change.source, noticeVersion: CONSENT_NOTICE_VERSION, userId: change.userId ?? undefined, recordedBy: change.recordedBy ?? undefined, note: change.note })
}

export async function isOptedOut(orgId: Types.ObjectId, channel: Channel, address: string): Promise<boolean> {
  return Boolean(await Suppression.exists({ orgId, channel, address: normalizeAddress(channel, address) }))
}
