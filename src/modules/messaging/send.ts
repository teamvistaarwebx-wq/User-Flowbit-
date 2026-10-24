import 'server-only'
import { Types } from 'mongoose'
import { dbConnect } from '@/lib/db'
import { appUrl, serverEnv } from '@/lib/env'
import { Message } from '@/models/messaging/Message'
import { Suppression } from '@/models/messaging/Suppression'
import { allowedRecipients, normalizeAddress, type SuppressionEntry } from './consent'
import { deliver } from './deliver'
import { isEssentialKind } from './delivery-status'
import type { Channel } from './events'
import { unsubscribeToken } from './signatures'
import { claim, liveAdapters, mongoStore, saveOutcome, toDeliverable } from './store'
import type { DeliverableMessage, DeliveryResult, MessageStatus, SkipReason } from './types'

/**
 * `enqueue()`: the one way any message leaves Flowbit (notifications-v2 §1.1).
 * It stores the message, honours the suppression list, then tries to send at
 * once; a failure goes back to the queue with backoff, and the
 * /api/cron/messages job (every 5 minutes) sends anything due.
 */

export type EnqueueAttachment = Readonly<{ filename: string; content: Buffer; mime?: string; fileId?: Types.ObjectId | string }>

export type EnqueueInput = Readonly<{
  channel: Channel
  to: string | readonly string[]
  cc?: readonly string[]
  orgId?: Types.ObjectId | string | null
  userId?: Types.ObjectId | string | null
  memberId?: Types.ObjectId | string | null
  event?: string
  group?: string
  kind?: string
  entity?: string
  entityId?: unknown
  subject?: string
  html?: string
  text?: string
  title?: string
  body?: string
  href?: string
  template?: string
  params?: Readonly<Record<string, string>>
  attachments?: readonly EnqueueAttachment[]
  headers?: Readonly<Record<string, string>>
  /** Defaults from the kind: alerts, digests and briefs are non-essential (unsubscribe applies). */
  essential?: boolean
  /** Live codes or tokens: masked in the stored copy once a provider has the mail; such mail is never retried. */
  secrets?: readonly string[]
  /** False when the caller retries on its own (Folio reminders). */
  retry?: boolean
  fallback?: Readonly<{ channel: Channel; to: readonly string[] }> | null
  /** Send later: the cron picks it up at this time. */
  scheduledFor?: Date
  /** Batched alert: waits for this digest slot. */
  digestAt?: Date
  /** Stored as skipped with this reason (snoozed…); nothing is sent. */
  skipReason?: SkipReason
  dedupeKey?: string
  /** Store as queued for the messages cron instead of sending inside this request (bulk cron work). */
  defer?: boolean
  fallbackOf?: string
  note?: string
  /** The automation rule that sent it (run history, the per-contact daily cap). */
  automationId?: Types.ObjectId | string | null
  /** WhatsApp: 'workspace' sends from the workspace's own number (WhatsApp B, wallet-charged); default Flowbit's. */
  sender?: 'platform' | 'workspace'
  /** A client contact, for client messages. */
  contactId?: Types.ObjectId | string | null
}>

export type EnqueueResult = Readonly<{ id: string; status: MessageStatus; ok: boolean; provider: string; error?: string; duplicate?: boolean }>

const MASK = '•••'
export const maskSecrets = (value: string | undefined, secrets: readonly string[]): string | undefined =>
  value === undefined ? value : secrets.reduce((out, secret) => (secret ? out.split(secret).join(MASK) : out), value)

const asId = (id: Types.ObjectId | string | null | undefined) => (id ? new Types.ObjectId(String(id)) : undefined)
const list = (to: string | readonly string[]) => (typeof to === 'string' ? [to] : [...to]).map((t) => t.trim()).filter(Boolean)
const isDuplicateKey = (error: unknown) => (error as { code?: number } | null)?.code === 11000

/** The public link that unsubscribes `email` from this workspace's non-essential mail. */
export function unsubscribeUrl(orgId: Types.ObjectId | string, email: string, oneClick = false): string {
  const token = unsubscribeToken({ orgId: String(orgId), email }, serverEnv().APP_SECRET)
  return appUrl(oneClick ? `/api/unsubscribe/${token}` : `/unsubscribe/${token}`)
}

/** RFC 8058 one-click unsubscribe headers for non-essential mail to one address. */
export const unsubscribeHeaders = (orgId: Types.ObjectId | string, email: string): Record<string, string> => ({
  'List-Unsubscribe': `<${unsubscribeUrl(orgId, email, true)}>`,
  'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
})

async function suppressionsFor(orgId: Types.ObjectId, channel: Channel, to: readonly string[]): Promise<SuppressionEntry[]> {
  const rows = await Suppression.find({ orgId, channel, address: { $in: to.map((t) => normalizeAddress(channel, t)) } }, { channel: 1, address: 1, scope: 1 }).lean()
  return rows.map((r) => ({ channel: r.channel as Channel, address: r.address, scope: r.scope ?? 'non_essential' }))
}

function initialStatus(input: EnqueueInput, skip: SkipReason | null, now: Date): MessageStatus {
  if (skip) return 'skipped'
  if (input.digestAt) return 'scheduled'
  return input.scheduledFor && input.scheduledFor.getTime() > now.getTime() ? 'scheduled' : 'queued'
}

/** Sends one stored, claimed message and records the result. */
export async function runDelivery(message: DeliverableMessage): Promise<DeliveryResult> {
  return deliver(message, { adapters: liveAdapters(), store: mongoStore(sendFallback) })
}

/** The copy of a message on its fallback channel (WhatsApp → email), linked both ways. */
async function sendFallback(message: DeliverableMessage, channel: Channel, to: readonly string[]): Promise<string> {
  const original = await Message.findById(message.id, { kind: 1, group: 1, essential: 1, memberId: 1, entity: 1, entityId: 1, automationId: 1 }).lean()
  const result = await enqueue({
    channel,
    to,
    orgId: message.orgId,
    userId: message.userId,
    memberId: original?.memberId,
    event: message.event,
    group: original?.group ?? undefined,
    kind: original?.kind ?? undefined,
    entity: original?.entity ?? undefined,
    entityId: original?.entityId ?? undefined,
    essential: original?.essential ?? undefined,
    subject: message.subject,
    html: message.html,
    text: message.text,
    title: message.title,
    body: message.body,
    href: message.href,
    attachments: message.attachments,
    headers: message.headers,
    fallbackOf: message.id,
    automationId: original?.automationId,
    note: `Fallback for the ${message.channel} message`,
  })
  return result.id
}

/**
 * Stores and (unless held) sends a message now. Never throws for a provider
 * error: the result says sent, queued for retry, failed or skipped.
 */
export async function enqueue(input: EnqueueInput): Promise<EnqueueResult> {
  await dbConnect()
  const now = new Date()
  const orgId = asId(input.orgId)
  const requested = list(input.to)
  const essential = input.essential ?? isEssentialKind(input.kind)
  const suppressed = orgId && input.channel !== 'inapp' && requested.length ? await suppressionsFor(orgId, input.channel, requested) : []
  const to = allowedRecipients(suppressed, input.channel, requested, essential)
  const skip: SkipReason | null = input.skipReason ?? (!requested.length ? 'no_address' : !to.length ? 'opted_out' : null)
  const status = initialStatus(input, skip, now)
  const secrets = input.secrets ?? []
  const retry = input.retry !== false && secrets.length === 0
  // Without a provider the stored copy is the only delivery (as the Outbox was), so it keeps the full message.
  const store = (value: string | undefined) => (serverEnv().RESEND_API_KEY && input.channel === 'email' ? maskSecrets(value, secrets) : value)
  const attachments = input.attachments ?? []

  let created
  try {
    created = await Message.create({
      orgId,
      channel: input.channel,
      to: to.length ? to : requested,
      cc: input.cc?.length ? [...input.cc] : undefined,
      userId: asId(input.userId),
      memberId: asId(input.memberId),
      event: input.event,
      group: input.group,
      kind: input.kind ?? 'other',
      entity: input.entity,
      entityId: input.entityId == null ? undefined : String(input.entityId),
      subject: store(input.subject),
      html: store(input.html),
      text: store(input.text),
      title: input.title,
      body: input.body,
      href: input.href,
      template: input.template,
      params: input.params,
      attachments: attachments.map((a) => ({ filename: a.filename, mime: a.mime, size: a.content.length, fileId: asId(a.fileId), data: status === 'skipped' ? undefined : a.content })),
      headers: input.headers,
      status,
      skipReason: skip ?? undefined,
      essential,
      retry,
      nextAttemptAt: status === 'queued' ? now : status === 'scheduled' && !input.digestAt ? input.scheduledFor : null,
      scheduledFor: input.scheduledFor,
      digestAt: input.digestAt,
      fallback: input.fallback ? { channel: input.fallback.channel, to: [...input.fallback.to] } : undefined,
      fallbackOf: asId(input.fallbackOf),
      dedupeKey: input.dedupeKey,
      automationId: asId(input.automationId),
      sender: input.channel === 'whatsapp' ? (input.sender ?? 'platform') : undefined,
      contactId: asId(input.contactId),
      timeline: [{ at: now, status, note: input.note ?? (skip ? undefined : status === 'scheduled' ? 'Held for a digest or a later time' : undefined) }],
    })
  } catch (error) {
    if (input.dedupeKey && isDuplicateKey(error)) return { id: '', status: 'skipped', ok: true, provider: 'none', duplicate: true }
    throw error
  }
  const id = String(created._id)
  // Held or skipped (opted out, snoozed) is not an error for the caller.
  if (status !== 'queued' || input.defer) return { id, status, ok: true, provider: 'none' }

  if (!(await claim(created._id, 'queued'))) return { id, status: 'queued', ok: true, provider: 'none' }
  const deliverable = await toDeliverable(created.toObject())
  if (!deliverable) {
    await saveOutcome(id, { status: 'failed', attempts: 1, error: 'An attachment could not be read.' }, { at: now, status: 'failed', note: 'An attachment could not be read.' })
    return { id, status: 'failed', ok: false, provider: 'none', error: 'An attachment could not be read.' }
  }
  // The first attempt sends the unmasked content; retries (never for secrets) use the stored copy.
  const fresh: DeliverableMessage = { ...deliverable, subject: input.subject, html: input.html, text: input.text, attachments: attachments.map((a) => ({ filename: a.filename, content: a.content, mime: a.mime })) }
  const result = await runDelivery(fresh)
  return toResult(id, result)
}

function toResult(id: string, result: DeliveryResult): EnqueueResult {
  if (result.status === 'sent') return { id, status: 'sent', ok: true, provider: result.provider ?? 'none' }
  if (result.status === 'skipped') return { id, status: 'skipped', ok: true, provider: result.skipReason === 'no_provider' ? 'outbox' : 'none' }
  return { id, status: result.status, ok: false, provider: result.provider ?? 'none', error: result.error }
}
