import 'server-only'
import { randomUUID } from 'node:crypto'
import { Types } from 'mongoose'
import { dbConnect } from '@/lib/db'
import { encryptionKey } from '@/lib/env'
import { openSecret } from '@/lib/secret-box'
import { Org } from '@/models/Org'
import { WebhookDelivery } from '@/models/integrations/WebhookDelivery'
import { WebhookEndpoint } from '@/models/integrations/WebhookEndpoint'
import { attemptDelivery, type Envelope } from './deliver'
import { postGuarded, type Poster } from './http'
import type { WebhookEvent } from './events'

/**
 * The outbound webhook queue. Events become one delivery row per subscribed
 * endpoint; the first try runs right away when possible, retries run from
 * the messages cron (every 5 minutes) on the retry schedule.
 */

const BATCH = 100
const STALE_MS = 10 * 60_000

export async function enqueue(orgId: Types.ObjectId | string, event: WebhookEvent, data: Record<string, unknown>, opts: { endpointId?: string; test?: boolean } = {}): Promise<string[]> {
  await dbConnect()
  const org = new Types.ObjectId(String(orgId))
  const endpoints = await WebhookEndpoint.find({ orgId: org, active: true, ...(opts.endpointId ? { _id: new Types.ObjectId(opts.endpointId) } : { events: event }) }, { _id: 1 }).lean()
  if (!endpoints.length) return []
  const workspace = (await Org.findById(org, { slug: 1 }).lean())?.slug ?? String(org)
  const created = await WebhookDelivery.insertMany(
    endpoints.map((e) => {
      const deliveryId = `whd_${randomUUID()}`
      const payload: Envelope = { id: deliveryId, event, created_at: new Date().toISOString(), workspace, data, ...(opts.test ? { test: true } : {}) }
      return { orgId: org, endpointId: e._id, deliveryId, event, payload, status: 'queued', nextAttemptAt: new Date(), test: Boolean(opts.test) }
    }),
  )
  return created.map((d) => String(d._id))
}

async function claim(id: Types.ObjectId): Promise<boolean> {
  const res = await WebhookDelivery.updateOne({ _id: id, status: 'queued' }, { $set: { status: 'sending' } })
  return res.modifiedCount === 1
}

/** Sends one claimed delivery and stores the outcome. */
async function sendOne(id: Types.ObjectId, post: Poster): Promise<string> {
  const delivery = await WebhookDelivery.findById(id).lean()
  if (!delivery) return 'gone'
  const endpoint = await WebhookEndpoint.findOne({ _id: delivery.endpointId, orgId: delivery.orgId }).lean()
  const key = encryptionKey()
  const secret = endpoint && key ? openSecret(endpoint.secretSealed, key) : null
  if (!endpoint || !endpoint.active || !secret) {
    await WebhookDelivery.updateOne({ _id: id }, { $set: { status: 'failed', lastError: !endpoint || !endpoint.active ? 'The webhook was removed or paused.' : 'The signing secret could not be opened (APP_ENCRYPTION_KEY).' } })
    return 'failed'
  }
  const outcome = await attemptDelivery(delivery.payload as Envelope, delivery.attempts ?? 0, { url: endpoint.url, secret }, post)
  const now = new Date()
  await WebhookDelivery.updateOne({ _id: id }, { $set: { status: outcome.status, attempts: outcome.attempts, nextAttemptAt: outcome.nextAttemptAt ?? now, lastStatusCode: outcome.code ?? undefined, lastError: outcome.error ?? undefined, ...(outcome.status === 'delivered' ? { deliveredAt: now } : {}) } })
  const ok = outcome.status === 'delivered'
  await WebhookEndpoint.updateOne({ _id: endpoint._id }, { $set: { lastDeliveryAt: now, lastStatus: ok ? 'delivered' : (outcome.error ?? 'failed'), ...(ok ? { failingSince: null } : {}) } })
  if (!ok) await WebhookEndpoint.updateOne({ _id: endpoint._id, failingSince: null }, { $set: { failingSince: now } })
  return outcome.status
}

/** Tries these deliveries now (after an event or a test). Never throws. */
export async function deliverNow(ids: readonly string[], post: Poster = postGuarded): Promise<void> {
  for (const raw of ids) {
    try {
      const id = new Types.ObjectId(raw)
      if (await claim(id)) await sendOne(id, post)
    } catch (error) {
      console.error('[webhooks] delivery failed', raw, error)
    }
  }
}

/** A delivery that hung until the cron was stopped goes to the back of the queue, and counts as a try. */
const STALE_RETRY_MS = 15 * 60_000

export type QueueResult = { delivered: number; retrying: number; failed: number; recovered: number }

/** Due retries across workspaces, within the time budget (messages cron). */
export async function runWebhookQueue(deadline: number = Date.now() + 60_000, post: Poster = postGuarded): Promise<QueueResult> {
  await dbConnect()
  const now = new Date()
  const tally: QueueResult = { delivered: 0, retrying: 0, failed: 0, recovered: 0 }
  tally.recovered = (await WebhookDelivery.updateMany({ status: 'sending', updatedAt: { $lt: new Date(now.getTime() - STALE_MS) } }, { $set: { status: 'queued', nextAttemptAt: new Date(now.getTime() + STALE_RETRY_MS) }, $inc: { attempts: 1 } })).modifiedCount
  const due = await WebhookDelivery.find({ status: 'queued', nextAttemptAt: { $lte: now } }, { _id: 1 }).sort({ nextAttemptAt: 1 }).limit(BATCH).lean()
  for (const row of due) {
    if (Date.now() > deadline) break
    if (!(await claim(row._id))) continue
    const status = await sendOne(row._id, post).catch((error: unknown) => {
      console.error('[webhooks] send failed', String(row._id), error)
      return 'failed'
    })
    if (status === 'delivered') tally.delivered++
    else if (status === 'queued') tally.retrying++
    else tally.failed++
  }
  return tally
}
