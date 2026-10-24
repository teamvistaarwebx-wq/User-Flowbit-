import 'server-only'
import { Types } from 'mongoose'
import { scoped } from '@/lib/db/scoped'
import { notify } from '@/lib/notify'
import { Client } from '@/models/Client'
import { FolioBillingProfile } from '@/models/folio/BillingProfile'
import { Member } from '@/models/Member'
import { Message } from '@/models/messaging/Message'
import { Lead } from '@/models/orbit/Lead'
import { Org } from '@/models/Org'
import { User } from '@/models/User'
import { WaThread } from '@/models/whatsapp/WaThread'
import { WaThreadMessage } from '@/models/whatsapp/WaThreadMessage'
import { canAdvance, refundsOnFailure } from '@/modules/messaging/delivery-status'
import { optIn, optOut } from '@/modules/messaging/suppression-store'
import type { MessageStatus } from '@/modules/messaging/types'
import { captureLead } from '@/modules/orbit/capture/create'
import { draftFromFields } from '@/modules/orbit/capture/map'
import { refundMessage } from '@/modules/wallet/account'
import { type InteraktResult } from './interakt'
import { sendWorkspaceText } from './workspace-text'
import { phonePattern } from './phone'
import { handleConversation } from './bot/conversation'
import { handleBotMessage } from './bot/commands'
import { claimInbound, releaseInbound } from './inbound-claim'
import { handleWorkspaceEvent, type InboundMatch, type MatchCandidate, type ThreadRef, type WorkspaceInboundDeps } from './workspace-inbound'
import type { InteraktEvent, InteraktInboundEvent, InteraktStatusEvent } from './webhook-event'

/**
 * The database side of a workspace's WhatsApp webhook. Every query carries
 * the workspace id that the webhook URL resolved to (tenancy), so one
 * workspace's events can never touch another's messages, inbox or STOP list.
 */

const oid = (id: string) => new Types.ObjectId(id)

/** WhatsApp source for Orbit leads made from an unknown number (added to the workspace's sources when missing). */
export const WHATSAPP_SOURCE = { key: 'whatsapp', label: 'WhatsApp', warm: true, active: true } as const

async function applyStatus(orgId: string, event: InteraktStatusEvent): Promise<'applied' | 'unknown'> {
  const messages = scoped(Message, oid(orgId))
  const byCallback = event.callbackData && Types.ObjectId.isValid(event.callbackData) ? await messages.findOne({ _id: event.callbackData, channel: 'whatsapp', sender: 'workspace' }, { status: 1, cost: 1 }).lean() : null
  const message = byCallback ?? (event.providerId ? await messages.findOne({ channel: 'whatsapp', sender: 'workspace', providerId: event.providerId }, { status: 1, cost: 1 }).lean() : null)
  if (message) {
    const advance = canAdvance(message.status as MessageStatus, event.status)
    const note = event.status === 'failed' ? `WhatsApp: ${event.error}` : `WhatsApp: ${event.status}`
    await messages.updateOne({ _id: message._id }, { ...(advance ? { $set: { status: event.status, ...(event.error ? { error: event.error } : {}) } } : {}), $push: { timeline: { at: event.at, status: advance ? event.status : message.status, note } } })
    if (advance && event.status === 'failed' && refundsOnFailure(message.status as MessageStatus)) await refundMessage(orgId, message._id)
  }
  const chat = event.providerId ? await scoped(WaThreadMessage, oid(orgId)).updateOne({ providerId: event.providerId, direction: 'out' }, { $set: { status: event.status, ...(event.error ? { error: event.error } : {}) } }) : null
  return message || chat?.modifiedCount ? 'applied' : 'unknown'
}

async function candidates(orgId: string, phone: string): Promise<MatchCandidate[]> {
  const id = oid(orgId)
  const pattern = phonePattern(phone)
  const [clients, profiles, leads, users] = await Promise.all([
    scoped(Client, id).find({ $or: [{ phone: pattern }, { 'contacts.phone': pattern }] }, { name: 1, displayName: 1, phone: 1, contacts: 1 }).limit(20).lean(),
    scoped(FolioBillingProfile, id).find({ $or: [{ 'recipients.phone': pattern }, { 'recipients.whatsapp': pattern }] }, { clientId: 1, recipients: 1 }).limit(20).lean(),
    scoped(Lead, id).find({ phone: pattern }, { companyName: 1, contactName: 1, phone: 1 }).sort({ updatedAt: -1 }).limit(20).lean(),
    User.find({ phone: pattern }, { name: 1, phone: 1 }).limit(20).lean(),
  ])
  const profileClients = profiles.length ? await scoped(Client, id).find({ _id: { $in: profiles.map((p) => p.clientId) } }, { name: 1, displayName: 1 }).lean() : []
  const clientName = new Map(profileClients.map((c) => [String(c._id), c.displayName || c.name]))
  const members = users.length ? await scoped(Member, id).find({ userId: { $in: users.map((u) => u._id) }, status: 'active' }, { userId: 1 }).lean() : []
  const memberUsers = new Set(members.map((m) => String(m.userId)))
  return [
    ...clients.map((c) => ({ kind: 'client' as const, id: String(c._id), label: c.displayName || c.name, phones: [c.phone, ...(c.contacts ?? []).map((x) => x.phone)] })),
    ...profiles.map((p) => ({ kind: 'client' as const, id: String(p.clientId), label: clientName.get(String(p.clientId)) ?? 'Client', phones: (p.recipients ?? []).flatMap((r) => [r.phone, r.whatsapp]) })),
    ...leads.map((l) => ({ kind: 'lead' as const, id: String(l._id), label: l.contactName ? `${l.contactName} (${l.companyName})` : l.companyName, phones: [l.phone] })),
    ...users.filter((u) => memberUsers.has(String(u._id))).map((u) => ({ kind: 'member' as const, id: String(u._id), label: u.name, phones: [u.phone] })),
  ]
}

/**
 * An unknown number becomes an Orbit lead through lead capture (assignment
 * rules, `lead.created`), with source "WhatsApp ad" when Meta marks the chat
 * as opened from a click-to-WhatsApp ad, else "WhatsApp". The inbox raises
 * its own alert, so capture does not alert twice.
 */
async function createLead(orgId: string, event: InteraktInboundEvent): Promise<InboundMatch | null> {
  const ad = event.referral
  const draft = draftFromFields(
    { name: event.name ?? '', phone: event.phone, message: [`Wrote on WhatsApp: "${event.text.slice(0, 300)}"`, ad?.headline ? `Ad: ${ad.headline}` : '', ad?.sourceUrl ? `Ad link: ${ad.sourceUrl}` : ''].filter(Boolean).join('\n') },
    ad ? 'whatsapp_ad' : 'whatsapp',
    { extraTags: ad ? ['click-to-whatsapp', ...(ad.sourceId ? [`ad-${ad.sourceId}`.slice(0, 40)] : [])] : [] },
  )
  if (!draft) return null
  const outcome = await captureLead(oid(orgId), { ...draft, utm: ad ? { source: 'whatsapp', medium: 'ctwa_ad', ...(ad.headline ? { campaign: ad.headline.slice(0, 120) } : {}) } : {} }, { alert: false })
  if (outcome.status !== 'created') return null
  return { kind: 'lead', id: outcome.leadId, label: event.name?.trim() || event.phone }
}

async function record(orgId: string, event: InteraktInboundEvent, match: InboundMatch | null, flags: { stop: boolean; start: boolean }): Promise<ThreadRef> {
  const id = oid(orgId)
  const thread = await WaThread.findOneAndUpdate(
    { orgId: id, phone: event.phone },
    {
      $set: {
        lastInboundAt: event.at,
        lastMessageAt: event.at,
        lastText: event.text.slice(0, 200),
        status: 'open',
        ...(event.name ? { name: event.name } : {}),
        ...(match ? { match: { kind: match.kind, id: oid(match.id), label: match.label } } : {}),
        ...(flags.stop ? { stoppedAt: event.at } : {}),
      },
      ...(flags.start ? { $unset: { stoppedAt: 1 } } : {}),
      $inc: { unread: 1 },
    },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
  ).lean()
  await scoped(WaThreadMessage, id).create({ threadId: thread!._id, direction: 'in', text: event.text, providerId: event.providerId ?? undefined, status: 'received', at: event.at })
  return { id: String(thread!._id), assignedTo: thread!.assignedTo ? String(thread!.assignedTo) : null }
}

export { sendWorkspaceText } from './workspace-text'

/** Stores an outgoing thread message with its result and moves the thread on. */
export async function storeThreadOut(orgId: Types.ObjectId, threadId: Types.ObjectId | string, text: string, result: InteraktResult, by: { memberId?: Types.ObjectId; name: string; messageId?: string }): Promise<void> {
  const now = new Date()
  await scoped(WaThreadMessage, orgId).create({ threadId, direction: 'out', text, providerId: result.ok ? result.id : undefined, status: result.ok ? 'sent' : 'failed', error: result.ok ? undefined : result.error, memberId: by.memberId, memberName: by.name, messageId: by.messageId && Types.ObjectId.isValid(by.messageId) ? oid(by.messageId) : undefined, at: now })
  await scoped(WaThread, orgId).updateOne({ _id: threadId }, { $set: { lastMessageAt: now, lastText: text.slice(0, 200) } })
}

async function alert(orgId: string, thread: ThreadRef, event: InteraktInboundEvent, match: InboundMatch | null): Promise<void> {
  const id = oid(orgId)
  const assignee = thread.assignedTo ? await scoped(Member, id).findOne({ _id: thread.assignedTo, status: 'active' }, { userId: 1 }).lean() : null
  const owners = assignee ? [] : await scoped(Member, id).find({ role: { $in: ['owner', 'admin'] }, status: 'active' }, { userId: 1 }).lean()
  const userIds = assignee ? [assignee.userId] : owners.map((o) => o.userId)
  const hour = event.at.toISOString().slice(0, 13)
  await notify({ orgId: id }, { userIds, title: `WhatsApp from ${match?.label ?? event.name ?? event.phone}`, body: event.text.slice(0, 140), href: `/app/whatsapp/${thread.id}`, kind: 'info', event: 'orbit.whatsapp_inbound', dedupeKey: `wa-in:${thread.id}:${hour}`, includeSelf: true })
}

export function workspaceInboundDeps(): WorkspaceInboundDeps {
  return {
    applyStatus,
    candidates,
    createLead,
    record,
    async suppress(orgId, phone) {
      await optOut({ orgId: oid(orgId), channel: 'whatsapp', address: phone, source: 'whatsapp_stop', scope: 'all', note: 'Replied STOP to this workspace on WhatsApp' })
    },
    async unsuppress(orgId, phone) {
      await optIn({ orgId: oid(orgId), channel: 'whatsapp', address: phone, source: 'whatsapp_stop', note: 'Replied START on WhatsApp' })
    },
    async reply(orgId, thread, phone, text) {
      const result = await sendWorkspaceText(oid(orgId), phone, text)
      await storeThreadOut(oid(orgId), thread.id, text, result, { name: 'Auto-reply' })
    },
    alert,
    claim: (orgId, providerId) => claimInbound(orgId, providerId),
    release: (orgId, providerId) => releaseInbound(orgId, providerId),
    async businessName(orgId) {
      return (await Org.findById(oid(orgId), { name: 1 }).lean())?.name ?? 'this business'
    },
    converse: (orgId, event) => handleConversation(oid(orgId), event, handleBotMessage),
  }
}

export const applyWorkspaceEvent = (orgId: Types.ObjectId, event: InteraktEvent) => handleWorkspaceEvent(workspaceInboundDeps(), String(orgId), event)
