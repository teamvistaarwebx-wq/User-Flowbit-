import 'server-only'
import type { Types } from 'mongoose'
import { Message } from '@/models/messaging/Message'
import { Outbox } from '@/models/Outbox'
import { isEssentialKind } from './delivery-status'
import type { MessageStatus, SkipReason } from './types'

/**
 * Copies Email log (Outbox) rows into Message so the Messages log keeps its
 * history. Idempotent: each row is copied once (unique legacyOutboxId) and
 * then stamped `migratedAt`. Runs in batches from the messages cron, and for
 * one workspace when its Messages log opens.
 */

const BATCH = 500

const STATUS: Readonly<Record<string, { status: MessageStatus; skip?: SkipReason; note: string }>> = {
  sent: { status: 'sent', note: 'Sent (copied from the Email log)' },
  failed: { status: 'failed', note: 'Failed (copied from the Email log)' },
  queued: { status: 'failed', note: 'The send never finished (copied from the Email log)' },
  logged: { status: 'skipped', skip: 'no_provider', note: 'Saved, not sent (copied from the Email log)' },
}

const isDuplicateKey = (error: unknown) => (error as { code?: number } | null)?.code === 11000
const hasOnlyDuplicates = (error: unknown) => {
  const errors = (error as { writeErrors?: { code?: number }[] } | null)?.writeErrors
  return isDuplicateKey(error) || (Array.isArray(errors) && errors.every((e) => e.code === 11000))
}

/** Copies up to BATCH unmigrated rows (optionally of one workspace); returns how many rows were handled. */
export async function migrateOutboxBatch(orgId?: Types.ObjectId): Promise<number> {
  const rows = await Outbox.find({ migratedAt: { $exists: false }, ...(orgId ? { orgId } : {}) }).sort({ _id: 1 }).limit(BATCH).lean()
  if (!rows.length) return 0
  const docs = rows.map((r) => {
    const mapped = STATUS[r.status ?? 'logged'] ?? STATUS.logged
    return {
      orgId: r.orgId,
      channel: 'email',
      to: r.to,
      cc: r.cc ?? undefined,
      kind: r.kind ?? 'other',
      entity: r.entity,
      entityId: r.entityId,
      subject: r.subject,
      html: r.html,
      text: r.text,
      attachments: (r.attachments ?? []).map((a) => ({ filename: a.filename ?? 'attachment', mime: a.mime, size: a.size, fileId: a.fileId })),
      status: mapped.status,
      skipReason: mapped.skip,
      essential: isEssentialKind(r.kind),
      retry: false,
      attempts: mapped.status === 'skipped' ? 0 : 1,
      provider: r.provider,
      providerId: r.providerId,
      error: r.error,
      sentAt: mapped.status === 'sent' ? r.updatedAt : undefined,
      legacyOutboxId: r._id,
      timeline: [{ at: r.createdAt, status: mapped.status, note: mapped.note }],
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }
  })
  try {
    await Message.insertMany(docs, { ordered: false, timestamps: false })
  } catch (error) {
    if (!hasOnlyDuplicates(error)) throw error
  }
  await Outbox.updateMany({ _id: { $in: rows.map((r) => r._id) } }, { $set: { migratedAt: new Date() } })
  return rows.length
}

/** True when this workspace still has Email log rows to copy. */
export const hasUnmigratedOutbox = async (orgId: Types.ObjectId): Promise<boolean> => Boolean(await Outbox.exists({ orgId, migratedAt: { $exists: false } }))
