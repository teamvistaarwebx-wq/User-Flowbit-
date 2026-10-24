'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { action, ok } from '@/lib/actions'
import { audit } from '@/lib/audit'
import type { Ctx } from '@/lib/ctx'
import { formatDate, todayIST } from '@/lib/dates'
import { NotFoundError, UserError } from '@/lib/errors'
import { notifyMembers } from '@/lib/notify'
import { isoDate, objectId, optionalText, requiredText } from '@/lib/validation'
import { Client } from '@/models/Client'
import { Member } from '@/models/Member'
import { FOLLOWUP_CHANNELS, FolioFollowup } from '@/models/folio/Followup'
import { FolioMessage } from '@/models/folio/MessageLog'
import { Invoice } from '@/models/folio/Invoice'
import { paragraphsOf } from './compose'
import { recipientsFor } from './recipients'
import { composeFor, loadReminderInvoices, sendReminderEmail, senderInfo } from './reminders'
import { TONE_LABELS } from './schedule'
import { isWhatsAppConnected } from '@/modules/whatsapp/connection'
import { reminderPreview, sendReminderTemplate } from '@/modules/whatsapp/reminder-send'

const ACT = { product: 'folio', perm: 'collections.write' } as const
const OUTCOME_REQUIRED = 'Write down what happened, even if it was nothing.'

function revalidateCollections(extra: string[] = []) {
  for (const path of ['/app/folio/collections', '/app/folio', ...extra]) revalidatePath(path)
}

async function assertInvoiceOfClient(ctx: Ctx, invoiceId: string | undefined, clientId: string): Promise<void> {
  if (!invoiceId) return
  const inv = await ctx.db(Invoice).findById(invoiceId, { clientId: 1 }).lean()
  if (!inv) throw new NotFoundError('That invoice')
  if (String(inv.clientId) !== clientId) throw new UserError('That invoice belongs to another client.', { invoiceId: 'Pick an invoice of this client' })
}

async function assertAssignee(ctx: Ctx, memberId: string | undefined): Promise<string> {
  if (!memberId) return String(ctx.memberId)
  const m = await ctx.db(Member).findOne({ _id: memberId, status: 'active' }, { _id: 1 }).lean()
  if (!m) throw new UserError('Pick an active member of this workspace.', { assignedTo: 'Pick an active member' })
  return memberId
}

const followupSchema = z.object({
  clientId: objectId,
  invoiceId: objectId.optional(),
  dueOn: isoDate,
  channel: z.enum(FOLLOWUP_CHANNELS).default('call'),
  subject: optionalText(200),
  notes: optionalText(2000),
  assignedTo: objectId.optional(),
})

export const createFollowupAction = action(
  followupSchema,
  async (input, ctx) => {
    const client = await ctx.db(Client).findById(input.clientId, { name: 1 }).lean()
    if (!client) throw new NotFoundError('That client')
    await assertInvoiceOfClient(ctx, input.invoiceId, input.clientId)
    const assignee = await assertAssignee(ctx, input.assignedTo)
    const f = await ctx.db(FolioFollowup).create({ ...input, assignedTo: assignee, status: 'open', createdBy: ctx.memberId })
    if (assignee !== String(ctx.memberId)) {
      await notifyMembers(ctx, [assignee], { title: `Follow up with ${client.name} on ${formatDate(input.dueOn)}`, body: input.subject, href: '/app/folio/collections', kind: 'assignment', product: 'folio', event: 'folio.followup_assigned' })
    }
    await audit(ctx, { action: 'followup.created', entity: 'FolioFollowup', entityId: f._id, product: 'folio', summary: `Follow-up for ${client.name} due ${formatDate(input.dueOn)}` })
    revalidateCollections()
    return ok(`Follow-up for ${client.name} scheduled for ${formatDate(input.dueOn)}.`)
  },
  ACT,
)

async function loadOpen(ctx: Ctx, id: string) {
  const f = await ctx.db(FolioFollowup).findById(id).lean()
  if (!f) throw new NotFoundError('That follow-up')
  if (f.status !== 'open' && f.status !== 'snoozed') throw new UserError('That follow-up is already closed.')
  return f
}

export const closeFollowupAction = action(
  z.object({ id: objectId, outcome: z.string({ error: OUTCOME_REQUIRED }).trim().min(1, OUTCOME_REQUIRED).max(2000, 'Keep it under 2,000 characters'), promisedOn: isoDate.optional(), nextOn: isoDate.optional() }),
  async (input, ctx) => {
    const f = await loadOpen(ctx, input.id)
    if (input.nextOn && input.nextOn < todayIST()) throw new UserError('Pick a date from today on for the next chase.', { nextOn: 'Today or later' })
    await ctx.db(FolioFollowup).updateOne({ _id: f._id }, { $set: { status: 'done', outcome: input.outcome, promisedOn: input.promisedOn, completedAt: new Date(), completedBy: ctx.memberId } })
    if (input.nextOn) {
      await ctx.db(FolioFollowup).create({ clientId: f.clientId, invoiceId: f.invoiceId ?? undefined, channel: f.channel, dueOn: input.nextOn, subject: 'Follow-up', notes: `Carried on from: ${input.outcome}`, status: 'open', assignedTo: ctx.memberId, createdBy: ctx.memberId })
    }
    await audit(ctx, { action: 'followup.closed', entity: 'FolioFollowup', entityId: f._id, product: 'folio', summary: `Closed a follow-up: ${input.outcome.slice(0, 120)}`, meta: { promisedOn: input.promisedOn, nextOn: input.nextOn } })
    revalidateCollections()
    return ok(input.nextOn ? 'Closed, and the next chase is scheduled.' : 'Closed. The outcome is on the record.')
  },
  ACT,
)

export const snoozeFollowupAction = action(
  z.object({ id: objectId, until: isoDate }),
  async (input, ctx) => {
    if (input.until <= todayIST()) throw new UserError('Snooze to a date after today.', { until: 'After today' })
    const f = await loadOpen(ctx, input.id)
    await ctx.db(FolioFollowup).updateOne({ _id: f._id }, { $set: { status: 'snoozed', snoozedUntil: input.until } })
    revalidateCollections()
    return ok(`Snoozed. It comes back on ${formatDate(input.until)}.`)
  },
  ACT,
)

export const dropFollowupAction = action(
  z.object({ id: objectId, reason: optionalText(300) }),
  async (input, ctx) => {
    const f = await loadOpen(ctx, input.id)
    await ctx.db(FolioFollowup).updateOne({ _id: f._id }, { $set: { status: 'cancelled', cancelReason: input.reason } })
    await audit(ctx, { action: 'followup.dropped', entity: 'FolioFollowup', entityId: f._id, product: 'folio', summary: `Dropped a follow-up${input.reason ? `: ${input.reason}` : ''}` })
    revalidateCollections()
    return ok('Follow-up dropped.')
  },
  ACT,
)

async function openInvoiceForReminder(ctx: Ctx, invoiceId: string) {
  const [inv] = await loadReminderInvoices(ctx, { _id: invoiceId })
  if (!inv) throw new NotFoundError('That invoice')
  if ((inv.status !== 'issued' && inv.status !== 'part_paid') || !(inv.balancePaise > 0)) throw new UserError(`Invoice ${inv.number} has nothing outstanding, so there is nothing to chase.`)
  return inv
}

export type ReminderPreview = {
  invoiceNumber: string
  toneLabel: string
  subject: string
  body: string
  whatsapp: string
  recipients: { id: string; name: string; email: string | null; whatsapp: string | null }[]
  /** The workspace's own number is connected: WhatsApp sends the approved reminder template instead of opening wa.me. */
  whatsappConnected: boolean
  /** The template filled in (for the first recipient) when connected. */
  templatePreview: string | null
}

export const previewReminderAction = action(
  z.object({ invoiceId: objectId }),
  async ({ invoiceId }, ctx) => {
    const inv = await openInvoiceForReminder(ctx, invoiceId)
    const [recipients, senders] = await Promise.all([recipientsFor(ctx, inv.clientId), senderInfo(ctx, ctx.org.name)])
    const primary = recipients.find((r) => r.receivesReminders) ?? recipients[0]
    const composed = composeFor(inv, senders.get(String(inv.entityId)), ctx.org.name, primary?.name ?? null, todayIST())
    const whatsappConnected = await isWhatsAppConnected(ctx.orgId)
    return ok<ReminderPreview>(undefined, {
      whatsappConnected,
      templatePreview: whatsappConnected ? reminderPreview({ invoice: inv, recipientName: primary?.name ?? null, business: senders.get(String(inv.entityId))?.company ?? ctx.org.name, asOf: todayIST() }) : null,
      invoiceNumber: inv.number ?? 'Invoice',
      toneLabel: TONE_LABELS[composed.tone],
      subject: composed.email.subject,
      body: composed.email.text,
      whatsapp: composed.whatsapp,
      recipients: recipients.filter((r) => r.receivesReminders).map((r) => ({ id: r.id, name: r.name, email: r.email, whatsapp: r.whatsapp })),
    })
  },
  { ...ACT, allowReadOnly: true },
)

async function resolveRecipient(ctx: Ctx, clientId: unknown, recipientId: string) {
  const list = await recipientsFor(ctx, String(clientId))
  const r = list.find((x) => x.id === recipientId)
  if (!r) throw new UserError('Pick one of the client’s billing contacts.', { recipientId: 'Pick a contact' })
  return r
}

export const sendReminderAction = action(
  z.object({ invoiceId: objectId, recipientId: requiredText('Recipient', 60), subject: requiredText('Subject', 200), body: requiredText('Message', 5000) }),
  async (input, ctx) => {
    const inv = await openInvoiceForReminder(ctx, input.invoiceId)
    const r = await resolveRecipient(ctx, inv.clientId, input.recipientId)
    if (!r.email) throw new UserError(`${r.name} has no email address. Add one on the client’s billing settings.`, { recipientId: 'No email' })
    const outcome = await sendReminderEmail(ctx, { orgId: ctx.orgId, invoice: inv, to: r.email, subject: input.subject, paragraphs: paragraphsOf(input.body), offsetDays: null, sentBy: ctx.memberId })
    if (outcome.status === 'failed') throw new UserError(`The email to ${r.email} failed: ${outcome.error ?? 'the provider refused it'}. Try again in a moment.`)
    await audit(ctx, { action: 'reminder.sent', entity: 'Invoice', entityId: inv._id, product: 'folio', summary: `Reminder for ${inv.number} emailed to ${r.email}`, meta: { channel: 'email', status: outcome.status } })
    revalidateCollections([`/app/folio/invoices/${input.invoiceId}`])
    return ok(outcome.status === 'sent' ? `Sent to ${r.email}.` : `Logged. No email provider is configured, so nothing was delivered to ${r.email}.`)
  },
  ACT,
)

export const recordWhatsAppAction = action(
  z.object({ invoiceId: objectId, recipientId: requiredText('Recipient', 60), body: requiredText('Message', 2000) }),
  async (input, ctx) => {
    const inv = await openInvoiceForReminder(ctx, input.invoiceId)
    const r = await resolveRecipient(ctx, inv.clientId, input.recipientId)
    if (!r.whatsapp) throw new UserError(`${r.name} has no WhatsApp or phone number.`, { recipientId: 'No number' })
    await ctx.db(FolioMessage).create({ kind: 'reminder', clientId: inv.clientId, invoiceId: inv._id, channel: 'whatsapp', status: 'logged', offsetDays: null, toAddress: r.whatsapp, body: input.body, sentAt: new Date(), sentBy: ctx.memberId })
    await audit(ctx, { action: 'reminder.sent', entity: 'Invoice', entityId: inv._id, product: 'folio', summary: `WhatsApp reminder for ${inv.number} sent to ${r.name}`, meta: { channel: 'whatsapp' } })
    revalidateCollections([`/app/folio/invoices/${input.invoiceId}`])
    return ok('Recorded. Send it from the WhatsApp window that opened.')
  },
  ACT,
)

/** The reminder template from the workspace's own WhatsApp number (WhatsApp B), to one of the client's contacts. */
export const sendWhatsAppReminderAction = action(
  z.object({ invoiceId: objectId, recipientId: requiredText('Recipient', 60) }),
  async (input, ctx) => {
    const inv = await openInvoiceForReminder(ctx, input.invoiceId)
    const r = await resolveRecipient(ctx, inv.clientId, input.recipientId)
    if (!r.whatsapp) throw new UserError(`${r.name} has no WhatsApp or phone number.`, { recipientId: 'No number' })
    if (!(await isWhatsAppConnected(ctx.orgId))) throw new UserError('WhatsApp is not connected. Use Open WhatsApp, or connect it in Settings → Integrations.')
    const senders = await senderInfo(ctx, ctx.org.name)
    const outcome = await sendReminderTemplate(ctx, { invoice: inv, to: r.whatsapp, recipientName: r.name, business: senders.get(String(inv.entityId))?.company ?? ctx.org.name, asOf: todayIST(), offsetDays: null, sentBy: ctx.memberId })
    if (outcome.status === 'failed') throw new UserError(`WhatsApp did not take it: ${outcome.error ?? 'unknown error'}`)
    await audit(ctx, { action: 'reminder.sent', entity: 'Invoice', entityId: inv._id, product: 'folio', summary: `WhatsApp reminder for ${inv.number} sent to ${r.name} from the workspace number`, meta: { channel: 'whatsapp', template: true } })
    revalidateCollections([`/app/folio/invoices/${input.invoiceId}`])
    return ok(`Reminder sent on WhatsApp to ${r.name}.`)
  },
  ACT,
)

export const markWhatsAppSentAction = action(
  z.object({ messageId: objectId }),
  async ({ messageId }, ctx) => {
    const res = await ctx.db(FolioMessage).updateOne({ _id: messageId, channel: 'whatsapp', status: 'queued' }, { $set: { status: 'logged', sentAt: new Date(), sentBy: ctx.memberId } })
    if (!res.matchedCount) throw new UserError('That message was already marked sent.')
    revalidateCollections()
    return ok('Marked sent.')
  },
  ACT,
)
