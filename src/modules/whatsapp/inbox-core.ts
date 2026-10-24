import { isStopKeyword } from '@/modules/messaging/consent'
import type { InteraktInboundEvent } from './webhook-event'

/**
 * One inbound WhatsApp message to Flowbit's number (pure orchestration,
 * storage injected): it lands in the Console inbox; STOP suppresses the
 * number at once (every workspace the person belongs to, and Flowbit's own
 * list) and turns their opt-in off; an unassigned conversation gets one
 * auto-reply a day pointing to email.
 */

/** One auto-reply per conversation per day at most. */
export const AUTO_REPLY_EVERY_MS = 24 * 3_600_000

export const AUTO_REPLY_TEXT = (supportEmail: string) =>
  `Thanks for your message. This number sends Flowbit bills and reminders. For help, write to ${supportEmail}; a team member will also reply here soon. Reply STOP to stop WhatsApp messages from Flowbit.`

export const STOP_CONFIRM_TEXT = 'You will not get WhatsApp messages from Flowbit any more. Bills and reminders still come by email. To restart, turn WhatsApp on in Flowbit → Settings → My account.'

export type InboxConversation = Readonly<{ id: string; assignedTo: string | null; autoRepliedAt: Date | null }>

export type InboxDeps = Readonly<{
  /** Stores the message on the number's conversation (created when new) and returns it. */
  record: (event: InteraktInboundEvent, flags: { stop: boolean }) => Promise<InboxConversation>
  /** Suppresses the number on WhatsApp for Flowbit and every workspace of the people using it; turns their opt-in off. */
  suppress: (phone: string) => Promise<void>
  /** Sends a free-text reply (inside the 24-hour window the inbound just opened) and stores it on the conversation. */
  reply: (conversation: InboxConversation, phone: string, text: string) => Promise<void>
  markAutoReplied: (conversationId: string, at: Date) => Promise<void>
  supportEmail: string
  /**
   * Claims the provider message id before anything is stored (unique index):
   * false for a redelivered webhook, even one arriving at the same moment.
   */
  claim?: (providerId: string) => Promise<boolean>
  /** Gives the claim back when handling failed, so the provider's retry runs. */
  release?: (providerId: string) => Promise<void>
}>

export type InboundOutcome = Readonly<{ stopped: boolean; autoReplied: boolean; conversationId: string; duplicate?: boolean }>

export const shouldAutoReply = (conversation: InboxConversation, now: Date): boolean =>
  !conversation.assignedTo && (!conversation.autoRepliedAt || now.getTime() - conversation.autoRepliedAt.getTime() >= AUTO_REPLY_EVERY_MS)

export async function handleInbound(deps: InboxDeps, event: InteraktInboundEvent, now: Date = new Date()): Promise<InboundOutcome> {
  // A redelivery must not store the message twice or re-send a reply (V2-REVIEW P2).
  const id = event.providerId
  if (id && deps.claim && !(await deps.claim(id))) return { stopped: false, autoReplied: false, conversationId: '', duplicate: true }
  try {
    return await handleClaimed(deps, event, now)
  } catch (error) {
    if (id && deps.release) await deps.release(id)
    throw error
  }
}

async function handleClaimed(deps: InboxDeps, event: InteraktInboundEvent, now: Date): Promise<InboundOutcome> {
  const stop = isStopKeyword(event.text)
  const conversation = await deps.record(event, { stop })
  if (stop) {
    await deps.suppress(event.phone)
    await deps.reply(conversation, event.phone, STOP_CONFIRM_TEXT)
    return { stopped: true, autoReplied: false, conversationId: conversation.id }
  }
  if (!shouldAutoReply(conversation, now)) return { stopped: false, autoReplied: false, conversationId: conversation.id }
  await deps.reply(conversation, event.phone, AUTO_REPLY_TEXT(deps.supportEmail))
  await deps.markAutoReplied(conversation.id, now)
  return { stopped: false, autoReplied: true, conversationId: conversation.id }
}
