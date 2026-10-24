import 'server-only'
import { Types } from 'mongoose'
import { serverEnv } from '@/lib/env'
import { PLATFORM_ORG_ID } from '@/lib/sequence'
import { Member } from '@/models/Member'
import { Message } from '@/models/messaging/Message'
import { User } from '@/models/User'
import { WaChatMessage } from '@/models/whatsapp/WaChatMessage'
import { WaConversation } from '@/models/whatsapp/WaConversation'
import { canAdvance } from '@/modules/messaging/delivery-status'
import { optOut } from '@/modules/messaging/suppression-store'
import type { MessageStatus } from '@/modules/messaging/types'
import { handleInbound, type InboxConversation, type InboxDeps } from './inbox-core'
import { interaktTextPayload, postToInterakt, type InteraktResult } from './interakt'
import { interaktKeys, liveFetch } from './platform-sender'
import type { InteraktEvent, InteraktInboundEvent, InteraktStatusEvent } from './webhook-event'
import { claimInbound, releaseInbound } from './inbound-claim'

/**
 * The database side of WhatsApp A's inbound traffic (console spec 10):
 * delivery ticks onto Message rows, inbound messages into the Console inbox,
 * STOP onto the suppression list the same minute, and free-text replies.
 */

/** A free-text (session) message from the messages number. */
export async function sendSessionText(phone: string, text: string, callbackData?: string): Promise<InteraktResult> {
  const key = interaktKeys().messages
  if (!key) return { ok: false, error: 'WhatsApp is not set up on this server (INTERAKT_API_KEY).', permanent: true }
  return postToInterakt(liveFetch, key, interaktTextPayload({ to: phone, text, callbackData }))
}

/** Stores an outgoing inbox message with its delivery result. */
export async function storeOutgoing(conversationId: Types.ObjectId | string, text: string, result: InteraktResult, by: { staffId?: Types.ObjectId; staffName: string }): Promise<void> {
  const now = new Date()
  await WaChatMessage.create({ conversationId, direction: 'out', text, providerId: result.ok ? result.id : undefined, status: result.ok ? 'sent' : 'failed', error: result.ok ? undefined : result.error, staffId: by.staffId, staffName: by.staffName, at: now })
  await WaConversation.updateOne({ _id: conversationId }, { $set: { lastMessageAt: now, lastText: text.slice(0, 200) } })
}

async function peopleOn(phone: string) {
  const users = await User.find({ phone }, { _id: 1 }).lean()
  const userIds = users.map((u) => u._id)
  const orgIds = userIds.length ? await Member.distinct('orgId', { userId: { $in: userIds }, status: 'active' }) : []
  return { userIds, orgIds: orgIds as Types.ObjectId[] }
}

const toConversation = (doc: { _id: unknown; assignedTo?: unknown; autoRepliedAt?: Date | null }): InboxConversation => ({ id: String(doc._id), assignedTo: doc.assignedTo ? String(doc.assignedTo) : null, autoRepliedAt: doc.autoRepliedAt ?? null })

export function inboxDeps(): InboxDeps {
  return {
    async record(event: InteraktInboundEvent, flags) {
      const { userIds, orgIds } = await peopleOn(event.phone)
      const conversation = await WaConversation.findOneAndUpdate(
        { phone: event.phone },
        {
          $set: { lastInboundAt: event.at, lastMessageAt: event.at, lastText: event.text.slice(0, 200), status: 'open', userIds, orgIds, ...(event.name ? { name: event.name } : {}), ...(flags.stop ? { stoppedAt: event.at } : {}) },
          $inc: { unread: 1 },
        },
        { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
      ).lean()
      await WaChatMessage.create({ conversationId: conversation!._id, direction: 'in', text: event.text, providerId: event.providerId ?? undefined, status: 'received', at: event.at })
      return toConversation(conversation!)
    },
    async suppress(phone) {
      const { userIds, orgIds } = await peopleOn(phone)
      const now = new Date()
      if (userIds.length) await User.updateMany({ _id: { $in: userIds } }, { $set: { 'whatsapp.optedOutAt': now } })
      for (const orgId of [PLATFORM_ORG_ID, ...orgIds]) {
        await optOut({ orgId, channel: 'whatsapp', address: phone, source: 'whatsapp_stop', scope: 'all', note: 'Replied STOP to Flowbit on WhatsApp' })
      }
    },
    async reply(conversation, phone, text) {
      const result = await sendSessionText(phone, text)
      await storeOutgoing(conversation.id, text, result, { staffName: 'Auto-reply' })
    },
    async markAutoReplied(id, at) {
      await WaConversation.updateOne({ _id: id }, { $set: { autoRepliedAt: at } })
    },
    supportEmail: serverEnv().SUPPORT_EMAIL,
    claim: (providerId) => claimInbound('platform', providerId),
    release: (providerId) => releaseInbound('platform', providerId),
  }
}

/** A delivery tick: the Message (our id in callbackData, else Interakt's id) and any inbox message moves forward only. */
async function applyStatus(event: InteraktStatusEvent): Promise<'applied' | 'unknown'> {
  const byCallback = event.callbackData && Types.ObjectId.isValid(event.callbackData) ? await Message.findById(event.callbackData, { status: 1, channel: 1 }).lean() : null
  const message = byCallback?.channel === 'whatsapp' ? byCallback : event.providerId ? await Message.findOne({ channel: 'whatsapp', providerId: event.providerId }, { status: 1 }).lean() : null
  if (message) {
    const advance = canAdvance(message.status as MessageStatus, event.status)
    const note = event.status === 'failed' ? `WhatsApp: ${event.error}` : `WhatsApp: ${event.status}`
    await Message.updateOne({ _id: message._id }, { ...(advance ? { $set: { status: event.status, ...(event.error ? { error: event.error } : {}) } } : {}), $push: { timeline: { at: event.at, status: advance ? event.status : message.status, note } } })
  }
  const chat = event.providerId ? await WaChatMessage.updateOne({ providerId: event.providerId, direction: 'out' }, { $set: { status: event.status === 'sent' ? 'sent' : event.status, ...(event.error ? { error: event.error } : {}) } }) : null
  return message || chat?.modifiedCount ? 'applied' : 'unknown'
}

export async function applyInteraktEvent(event: InteraktEvent): Promise<string> {
  if (event.kind === 'status') return applyStatus(event)
  const outcome = await handleInbound(inboxDeps(), event)
  return outcome.duplicate ? 'duplicate' : outcome.stopped ? 'stopped' : outcome.autoReplied ? 'auto_replied' : 'stored'
}
