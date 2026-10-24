import 'server-only'
import { Types } from 'mongoose'
import { Message } from '@/models/messaging/Message'
import { Org } from '@/models/Org'
import { User } from '@/models/User'
import { digestShape, groupForDigest } from './digest'
import { migrateOutboxBatch } from './migrate-outbox'
import { enqueue, runDelivery, unsubscribeHeaders, unsubscribeUrl } from './send'
import { claim, loadDeliverable, saveOutcome } from './store'
import { digestEmail, type DigestItem } from './templates'

/**
 * The /api/cron/messages job (every 5 minutes): send what is due (retries and
 * scheduled sends), flush digests whose slot has come, recover sends that
 * crashed mid-way, and copy old Outbox rows into the Messages log.
 */

/** Stop starting new sends after this long (the route's maxDuration is 300 s). */
const TIME_BUDGET_MS = 200_000
const BATCH = 200
/** Resend allows about 2 requests a second by default. */
const SEND_GAP_MS = 550
/** A message stuck in 'sending' this long was cut off mid-run; it goes back to the queue. */
const STALE_SENDING_MS = 10 * 60_000

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export type MessagesJobResult = { sent: number; failed: number; retrying: number; skipped: number; digests: number; recovered: number; migrated: number; outOfTime: boolean }

async function recoverStale(now: Date): Promise<number> {
  const stale = { status: 'sending' as const, updatedAt: { $lt: new Date(now.getTime() - STALE_SENDING_MS) } }
  // Mail that must not be retried (secrets are masked in the stored copy; hand-sent mail) is failed, never sent again (V2-REVIEW R3).
  await Message.updateMany(
    { ...stale, retry: false },
    { $set: { status: 'failed', error: 'The send was interrupted.' }, $push: { timeline: { at: now, status: 'failed', note: 'The send was interrupted; not retried.' } } },
  )
  const res = await Message.updateMany(
    { ...stale, retry: { $ne: false } },
    { $set: { status: 'queued', nextAttemptAt: now }, $push: { timeline: { at: now, status: 'queued', note: 'The send was interrupted; queued again.' } } },
  )
  return res.modifiedCount
}

/** Sends due queued and scheduled (non-digest) messages, oldest first, within the time budget. */
async function sendDue(now: Date, deadline: number, tally: MessagesJobResult): Promise<void> {
  const due = await Message.find(
    { $or: [{ status: 'queued', nextAttemptAt: { $lte: now } }, { status: 'scheduled', digestAt: null, nextAttemptAt: { $lte: now } }] },
    { _id: 1, status: 1 },
  )
    .sort({ nextAttemptAt: 1 })
    .limit(BATCH)
    .lean()
  for (const row of due) {
    if (Date.now() > deadline) {
      tally.outOfTime = true
      return
    }
    if (!(await claim(row._id, row.status === 'scheduled' ? 'scheduled' : 'queued'))) continue
    const message = await loadDeliverable(row._id)
    if (message === 'gone') continue
    if (message === 'missing_attachment') {
      await saveOutcome(String(row._id), { status: 'failed', attempts: 1, error: 'An attachment could not be read.' }, { at: new Date(), status: 'failed', note: 'An attachment could not be read.' })
      tally.failed++
      continue
    }
    const result = await runDelivery(message)
    if (result.status === 'sent') tally.sent++
    else if (result.status === 'queued') tally.retrying++
    else if (result.status === 'skipped') tally.skipped++
    else tally.failed++
    if (message.channel === 'email') await sleep(SEND_GAP_MS)
  }
}

type DigestRow = { _id: Types.ObjectId; orgId: Types.ObjectId | null; userId: Types.ObjectId | null; to: string[]; title?: string | null; body?: string | null; href?: string | null; group?: string | null; createdAt: Date }

/** One person's held alerts: a single one goes out as itself, several as one digest email. */
async function flushOne(rows: readonly DigestRow[], now: Date): Promise<'single' | 'digest' | 'none'> {
  const first = rows[0]
  if (!first.orgId) return 'none'
  const ids = rows.map((r) => r._id)
  if (digestShape(rows) === 'single') {
    await Message.updateOne({ _id: first._id, status: 'scheduled' }, { $set: { status: 'queued', nextAttemptAt: now, digestAt: null }, $push: { timeline: { at: now, status: 'queued', note: 'Released from the digest hold' } } })
    return 'single'
  }
  const [org, user] = await Promise.all([Org.findById(first.orgId, { name: 1 }).lean(), first.userId ? User.findById(first.userId, { email: 1 }).lean() : null])
  const email = user?.email ?? first.to[0]
  const items: DigestItem[] = rows.map((r) => ({ title: r.title ?? 'Update', body: r.body ?? undefined, href: r.href ?? undefined, group: r.group ?? 'other', at: r.createdAt }))
  const mail = digestEmail(items, { orgName: org?.name ?? 'your workspace', unsubscribeUrl: unsubscribeUrl(first.orgId, email) })
  const digest = await enqueue({ channel: 'email', to: email, orgId: first.orgId, userId: first.userId, kind: 'digest', event: 'digest', ...mail, headers: unsubscribeHeaders(first.orgId, email), defer: true, note: `Digest of ${rows.length} alerts` })
  await Message.updateMany(
    { _id: { $in: ids }, status: 'scheduled' },
    { $set: { status: 'skipped', skipReason: 'digest', digestId: digest.id ? new Types.ObjectId(digest.id) : undefined, attempts: 0 }, $push: { timeline: { at: now, status: 'skipped', note: 'Sent inside a digest email' } } },
  )
  return 'digest'
}

/** Groups held alerts whose slot has come by (workspace, person) and sends them. */
async function flushDigests(now: Date): Promise<number> {
  const held = await Message.find({ status: 'scheduled', digestAt: { $ne: null, $lte: now } }, { orgId: 1, userId: 1, to: 1, title: 1, body: 1, href: 1, group: 1, createdAt: 1 })
    .sort({ createdAt: 1 })
    .limit(BATCH * 5)
    .lean<DigestRow[]>()
  let digests = 0
  for (const rows of groupForDigest(held)) {
    try {
      if ((await flushOne(rows, now)) === 'digest') digests++
    } catch (error) {
      console.error('[messages] digest flush failed for', String(rows[0].userId ?? rows[0].to[0]), error)
    }
  }
  return digests
}

export async function runMessagesJob(now: Date = new Date()): Promise<MessagesJobResult> {
  const deadline = Date.now() + TIME_BUDGET_MS
  const tally: MessagesJobResult = { sent: 0, failed: 0, retrying: 0, skipped: 0, digests: 0, recovered: 0, migrated: 0, outOfTime: false }
  tally.recovered = await recoverStale(now)
  tally.digests = await flushDigests(now)
  await sendDue(new Date(), deadline, tally)
  if (!tally.outOfTime) tally.migrated = await migrateOutboxBatch()
  return tally
}
