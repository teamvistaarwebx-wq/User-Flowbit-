import 'server-only'
import { Types } from 'mongoose'
import { Resend } from 'resend'
import { serverEnv } from '@/lib/env'
import { readStoredFile } from '@/lib/files'
import { Message } from '@/models/messaging/Message'
import { Notification } from '@/models/Notification'
import { emailAdapter, type ResendLike } from './channels/email'
import { inappAdapter, type InAppRow } from './channels/inapp'
import { platformWhatsAppAdapter } from '@/modules/whatsapp/platform-sender'
import { workspaceWhatsAppAdapter } from '@/modules/whatsapp/workspace-sender'
import { whatsAppEnabled } from '@/modules/features/flags'
import type { DeliveryPatch, DeliveryStore } from './deliver'
import type { Channel } from './events'
import type { ChannelAdapter, DeliverableMessage, OutgoingAttachment, TimelineEntry } from './types'
import { whatsappFlagGate } from './channels/whatsapp-gate'

/**
 * The Mongo side of the pipeline: the channel adapters wired to real
 * providers, loading a stored message back into a deliverable one, and
 * saving delivery outcomes onto it (status + timeline).
 */

const writeInApp = async (rows: readonly InAppRow[]) => {
  await Notification.insertMany(rows.map((r) => ({ orgId: new Types.ObjectId(r.orgId), userId: new Types.ObjectId(r.userId), title: r.title, body: r.body, href: r.href, event: r.event, kind: 'info' })))
}

/** The live adapters. The Resend client is built per send, so tests never reach it. */
export function liveAdapters(): Partial<Record<Channel, ChannelAdapter>> {
  const env = serverEnv()
  return {
    email: emailAdapter({ apiKey: env.RESEND_API_KEY, from: env.MAIL_FROM, client: (key) => new Resend(key) as unknown as ResendLike }),
    inapp: inappAdapter(writeInApp),
    // WhatsApp A (Flowbit's own numbers) or B (the workspace's own number, wallet-charged), by the message's sender.
    // Nothing goes out on WhatsApp while the feature flag is off; the pipeline falls back to email where it can.
    whatsapp: whatsappFlagGate(whatsappRouter(platformWhatsAppAdapter(), workspaceWhatsAppAdapter()), whatsAppEnabled),
  }
}


/** Sends WhatsApp B messages through the workspace's number and everything else through Flowbit's. */
export const whatsappRouter = (platform: ChannelAdapter, workspace: ChannelAdapter): ChannelAdapter => ({
  channel: 'whatsapp',
  send: (message) => (message.sender === 'workspace' ? workspace.send(message) : platform.send(message)),
})

type StoredDoc = NonNullable<Awaited<ReturnType<typeof loadDoc>>>
const loadDoc = (id: Types.ObjectId | string) => Message.findById(id).select('+attachments.data').lean()

/** Attachment bytes: kept on the message until it is sent, else read back from file storage. */
async function attachmentsOf(doc: StoredDoc): Promise<OutgoingAttachment[] | 'missing'> {
  const out: OutgoingAttachment[] = []
  for (const a of doc.attachments ?? []) {
    if (a.data) {
      out.push({ filename: a.filename, content: Buffer.from(a.data as unknown as Uint8Array), mime: a.mime ?? undefined })
      continue
    }
    const stored = a.fileId && doc.orgId ? await readStoredFile(doc.orgId, String(a.fileId)) : null
    if (!stored) return 'missing'
    out.push({ filename: a.filename, content: stored.data, mime: a.mime ?? stored.file.mime })
  }
  return out
}

const optional = (value: string | null | undefined) => value ?? undefined

/** Turns a stored message into what `deliver` sends; null when an attachment can no longer be read. */
export async function toDeliverable(doc: StoredDoc): Promise<DeliverableMessage | null> {
  const attachments = await attachmentsOf(doc)
  if (attachments === 'missing') return null
  const fallback = doc.fallback?.channel && doc.fallback.to?.length ? { channel: doc.fallback.channel as Channel, to: [...doc.fallback.to] } : null
  return {
    id: String(doc._id),
    channel: doc.channel as Channel,
    orgId: doc.orgId ? String(doc.orgId) : undefined,
    userId: doc.userId ? String(doc.userId) : undefined,
    to: [...doc.to],
    cc: doc.cc ? [...doc.cc] : undefined,
    subject: optional(doc.subject),
    html: optional(doc.html),
    text: optional(doc.text),
    title: optional(doc.title),
    body: optional(doc.body),
    href: optional(doc.href),
    event: optional(doc.event),
    kind: optional(doc.kind),
    template: optional(doc.template),
    params: (doc.params as Record<string, string> | undefined) ?? undefined,
    attachments,
    headers: (doc.headers as Record<string, string> | undefined) ?? undefined,
    sender: doc.sender === 'workspace' ? 'workspace' : 'platform',
    attempts: doc.attempts ?? 0,
    retry: doc.retry !== false,
    fallback,
    createdAt: (doc as { createdAt?: Date }).createdAt,
  }
}

export async function loadDeliverable(id: Types.ObjectId | string): Promise<DeliverableMessage | 'gone' | 'missing_attachment'> {
  const doc = await loadDoc(id)
  if (!doc) return 'gone'
  return (await toDeliverable(doc)) ?? 'missing_attachment'
}

const SENT_STATUSES = new Set(['sent', 'skipped'])

/** Saves an outcome; once sent, the attachment bytes are dropped (stored files keep their own copy). */
export async function saveOutcome(id: string, patch: DeliveryPatch, entry: TimelineEntry): Promise<void> {
  const set = Object.fromEntries(Object.entries({ ...patch, fallbackId: patch.fallbackId ? new Types.ObjectId(patch.fallbackId) : undefined }).filter(([, v]) => v !== undefined))
  const unset = SENT_STATUSES.has(patch.status) ? { $unset: { 'attachments.$[].data': '' } } : {}
  await Message.updateOne({ _id: id }, { $set: set, $push: { timeline: entry }, ...unset })
}

/** Moves a message from `from` to sending; false when someone else took it first. */
export async function claim(id: Types.ObjectId | string, from: 'queued' | 'scheduled'): Promise<boolean> {
  const res = await Message.updateOne({ _id: id, status: from }, { $set: { status: 'sending' } })
  return res.modifiedCount === 1
}

export type FallbackSender = (message: DeliverableMessage, channel: Channel, to: readonly string[]) => Promise<string>

export const mongoStore = (fallback: FallbackSender): DeliveryStore => ({ save: saveOutcome, fallback })
