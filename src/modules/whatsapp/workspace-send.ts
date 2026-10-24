import 'server-only'
import type { Types } from 'mongoose'
import { enqueue, type EnqueueAttachment, type EnqueueResult } from '@/modules/messaging/send'
import { senderConfig } from './connection'
import { renderCustomerTemplate, type CustomerTemplateKey } from './customer-templates'
import { normalizePhone } from './phone'
import type { WaExtras } from './templates'

/**
 * Sends one WhatsApp B template from a workspace's own number through
 * `enqueue` (suppression and STOP honoured, cost charged to the wallet by the
 * channel, delivery ticks from the workspace webhook). The email copy, when
 * given, goes out instead if WhatsApp cannot deliver it.
 */

export type WorkspaceTemplateSend = Readonly<{
  orgId: Types.ObjectId
  to: string
  key: CustomerTemplateKey
  values: Readonly<Record<string, string>>
  extras?: WaExtras
  kind: string
  event?: string
  entity?: string
  entityId?: unknown
  essential?: boolean
  userId?: Types.ObjectId | string | null
  memberId?: Types.ObjectId | string | null
  contactId?: Types.ObjectId | string | null
  automationId?: Types.ObjectId | string | null
  dedupeKey?: string
  scheduledFor?: Date
  defer?: boolean
  /** Shown in the Messages log (and the bell for in-app). */
  title?: string
  body?: string
  /** The email copy: sent instead when WhatsApp cannot deliver (not connected, empty wallet). */
  emailFallback?: Readonly<{ to: readonly string[]; subject: string; html: string; text: string; attachments?: readonly EnqueueAttachment[]; headers?: Readonly<Record<string, string>> }>
  note?: string
}>

export type WorkspaceSendResult = EnqueueResult | Readonly<{ id: ''; status: 'refused'; ok: false; provider: 'none'; error: string }>

const refused = (error: string): WorkspaceSendResult => ({ id: '', status: 'refused', ok: false, provider: 'none', error })

export async function sendWorkspaceTemplate(input: WorkspaceTemplateSend): Promise<WorkspaceSendResult> {
  const phone = normalizePhone(input.to)
  if (!phone) return refused('That is not a valid WhatsApp number. Use a 10-digit Indian mobile, or +country code and number.')
  const config = await senderConfig(input.orgId)
  if (!config && !input.emailFallback) return refused('WhatsApp is not connected. Connect it in Settings → Integrations → WhatsApp.')
  let rendered
  try {
    rendered = config ? renderCustomerTemplate(input.key, config.templates, input.values, input.extras) : null
  } catch (error) {
    if (!input.emailFallback) return refused(error instanceof Error ? error.message : 'The WhatsApp template could not be filled in.')
    rendered = null
  }
  const fallback = input.emailFallback
  return enqueue({
    channel: 'whatsapp',
    sender: 'workspace',
    to: phone,
    orgId: input.orgId,
    userId: input.userId,
    memberId: input.memberId,
    contactId: input.contactId,
    kind: input.kind,
    event: input.event,
    entity: input.entity,
    entityId: input.entityId,
    essential: input.essential,
    automationId: input.automationId,
    dedupeKey: input.dedupeKey,
    scheduledFor: input.scheduledFor,
    defer: input.defer,
    template: rendered?.template,
    params: rendered?.params,
    title: input.title,
    body: input.body,
    subject: fallback?.subject,
    html: fallback?.html,
    text: fallback?.text,
    attachments: fallback?.attachments,
    headers: fallback?.headers,
    fallback: fallback ? { channel: 'email', to: fallback.to } : null,
    note: input.note,
  })
}
