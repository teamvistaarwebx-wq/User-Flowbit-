import 'server-only'
import type { Types } from 'mongoose'
import { appUrl, serverEnv } from '@/lib/env'
import { emailLayout } from '@/lib/mail'
import { Member } from '@/models/Member'
import { Org } from '@/models/Org'
import { User } from '@/models/User'
import { consoleSettings } from '@/modules/console/settings-query'
import { enqueue, type EnqueueAttachment } from '@/modules/messaging/send'
import { waRecipients } from '@/modules/whatsapp/recipients'
import { renderWaTemplate, type WaExtras, type WaTemplateKey } from '@/modules/whatsapp/templates'
import { signBillToken } from './bill-token'

/**
 * Flowbit's billing messages to a workspace (console spec 11): email first,
 * to the billing email and the owner; then WhatsApp A to the owners and
 * admins who verified their number and opted in. Both go through `enqueue`,
 * deduplicated per workspace and key, so a cron that runs twice sends once.
 */

export type BillingAudience = { emails: string[]; phones: string[]; name: string; workspace: string }

export async function billingAudience(orgId: Types.ObjectId): Promise<BillingAudience> {
  const [org, members] = await Promise.all([Org.findById(orgId, { name: 1, 'subscription.billing': 1 }).lean(), Member.find({ orgId, status: 'active', role: { $in: ['owner', 'admin'] } }, { userId: 1, role: 1, status: 1 }).lean()])
  const users = await User.find({ _id: { $in: members.map((m) => m.userId) } }, { name: 1, email: 1, phone: 1, phoneVerifiedAt: 1, whatsapp: 1 }).lean()
  const owner = members.find((m) => m.role === 'owner')
  const ownerUser = users.find((u) => String(u._id) === String(owner?.userId))
  const emails = [...new Set([org?.subscription?.billing?.email, ownerUser?.email].filter((e): e is string => Boolean(e)))]
  const phones = waRecipients(
    members.map((m) => ({ role: m.role, status: m.status, userId: String(m.userId) })),
    users.map((u) => ({ id: String(u._id), phone: u.phone, phoneVerifiedAt: u.phoneVerifiedAt, whatsapp: u.whatsapp })),
  )
  return { emails, phones, name: ownerUser?.name?.split(' ')[0] ?? 'there', workspace: org?.name ?? 'your workspace' }
}

export const billPublicUrl = (publicKey: string) => appUrl(`/bill/${signBillToken(publicKey, serverEnv().APP_SECRET)}`)
export const billPdfUrl = (publicKey: string) => appUrl(`/api/public/bill/${signBillToken(publicKey, serverEnv().APP_SECRET)}/pdf`)
/** Template URL buttons are `https://<app>/{{1}}`: the suffix is the path. */
export const billButtonSuffix = (publicKey: string) => `bill/${signBillToken(publicKey, serverEnv().APP_SECRET)}`
export const BILLING_PAGE_SUFFIX = 'app/settings/billing'

export type BillingMessage = Readonly<{
  orgId: Types.ObjectId
  event: string
  dedupeKey: string
  subject: string
  title: string
  paragraphs: string[]
  cta?: { label: string; href: string }
  attachments?: readonly EnqueueAttachment[]
  entity?: string
  entityId?: unknown
  whatsapp?: Readonly<{ key: WaTemplateKey; values: Record<string, string>; extras?: WaExtras }>
  /** Crons leave sending to the messages cron. */
  defer?: boolean
}>

export type BillingSendResult = { emails: number; whatsapp: number }

export async function sendBillingMessage(message: BillingMessage, audience?: BillingAudience): Promise<BillingSendResult> {
  const who = audience ?? (await billingAudience(message.orgId))
  const base = { orgId: message.orgId, event: message.event, kind: 'subscription', essential: true, entity: message.entity, entityId: message.entityId, defer: message.defer }
  let emails = 0
  if (who.emails.length) {
    const mail = emailLayout({ title: message.title, paragraphs: message.paragraphs, cta: message.cta, workspace: who.workspace })
    await enqueue({ ...base, channel: 'email', to: who.emails, subject: message.subject, ...mail, attachments: message.attachments, dedupeKey: message.dedupeKey })
    emails = who.emails.length
  }
  if (!message.whatsapp || !who.phones.length) return { emails, whatsapp: 0 }
  let rendered
  try {
    const { whatsapp } = await consoleSettings()
    rendered = renderWaTemplate(message.whatsapp.key, whatsapp.templates, { name: who.name, workspace: who.workspace, ...message.whatsapp.values }, message.whatsapp.extras)
  } catch (error) {
    console.error('[billing] WhatsApp template not sent', message.event, error)
    return { emails, whatsapp: 0 }
  }
  for (const phone of who.phones) {
    // Email already went out, so no fallback: a failed WhatsApp is only logged on the message.
    await enqueue({ ...base, channel: 'whatsapp', to: phone, template: rendered.template, params: rendered.params, title: message.title, body: message.paragraphs[0], dedupeKey: `${message.dedupeKey}:wa:${phone}` })
  }
  return { emails, whatsapp: who.phones.length }
}
