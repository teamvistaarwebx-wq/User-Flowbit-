import 'server-only'
import type { Types } from 'mongoose'
import { ConsentLog } from '@/models/messaging/ConsentLog'
import { numberConsentRow, type NumberGiven } from './number-consent'

/** Writes the consent row for a number given to a contact (no-op when unchanged); never fails the save that called it. */
export async function recordNumberGiven(ctx: { orgId: Types.ObjectId; userId: Types.ObjectId }, input: NumberGiven & { contactId?: Types.ObjectId | null }): Promise<void> {
  const row = numberConsentRow(input)
  if (!row) return
  try {
    await ConsentLog.create({ orgId: ctx.orgId, ...row, recordedBy: ctx.userId, ...(input.contactId ? { contactId: input.contactId } : {}) })
  } catch (error) {
    console.error('[consent] number consent not logged', String(ctx.orgId), error)
  }
}
