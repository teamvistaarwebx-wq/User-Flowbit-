import 'server-only'
import { Types } from 'mongoose'
import { formatDate } from '@/lib/dates'
import { appUrl } from '@/lib/env'
import { formatINR } from '@/lib/money'
import { firstName } from '@/lib/utils'
import { FolioMessage } from '@/models/folio/MessageLog'
import { ensureDocLink } from '@/modules/doclinks/links'
import { daysOverdue } from '@/modules/folio/engine/aging'
import type { FolioScope } from '@/modules/folio/queries/common'
import { isDuplicateKey, type ReminderInvoiceDoc } from '@/modules/folio/collections/reminders'
import { buttonSuffix, previewCustomerTemplate, reminderTemplateFor, type CustomerTemplateKey } from './customer-templates'
import { docPayloads } from './doc-send'
import { sendWorkspaceTemplate } from './workspace-send'

/**
 * Payment reminders on WhatsApp B (before due, on the due date, overdue),
 * for the Collections dialog and the automatic reminder run. Like the email
 * reminders, an automatic one claims its (invoice, channel, offset) slot in
 * the client's message log first, so a second run never sends it twice.
 */

export type ReminderTemplateInput = Readonly<{
  invoice: ReminderInvoiceDoc
  to: string
  recipientName: string | null
  business: string
  asOf: string
  /** null for a reminder sent by hand. */
  offsetDays: number | null
  sentBy?: Types.ObjectId | null
}>

export type ReminderValues = Readonly<{ key: CustomerTemplateKey; values: Record<string, string> }>

/** The template and its values for an invoice's position against the due date. */
export function reminderValues(input: Pick<ReminderTemplateInput, 'invoice' | 'recipientName' | 'business' | 'asOf'>): ReminderValues {
  const days = daysOverdue(input.invoice.dueDate, input.asOf)
  return {
    key: reminderTemplateFor(days),
    values: { name: firstName(input.recipientName || 'there'), business: input.business, number: input.invoice.number ?? 'Invoice', amount: formatINR(input.invoice.balancePaise ?? 0, { decimals: 2 }), dueDate: formatDate(input.invoice.dueDate), days: String(Math.max(days, 0)) },
  }
}

export const reminderPreview = (input: Pick<ReminderTemplateInput, 'invoice' | 'recipientName' | 'business' | 'asOf'>): string => {
  const r = reminderValues(input)
  return previewCustomerTemplate(r.key, r.values)
}

export type ReminderSendOutcome = Readonly<{ status: 'sent' | 'failed' | 'duplicate'; error?: string; messageId?: string }>

export async function sendReminderTemplate(scope: FolioScope, input: ReminderTemplateInput): Promise<ReminderSendOutcome> {
  const { key, values } = reminderValues(input)
  const body = previewCustomerTemplate(key, values)
  let slot: Types.ObjectId
  try {
    // 'sent' claims the slot (the unique index covers it); a failure turns it to 'failed' and the next run tries again.
    const claimed = await scope.db(FolioMessage).create({ kind: 'reminder', clientId: input.invoice.clientId, invoiceId: input.invoice._id, channel: 'whatsapp', offsetDays: input.offsetDays, status: 'sent', toAddress: input.to, body, sentBy: input.sentBy ?? undefined })
    slot = claimed._id
  } catch (error) {
    if (isDuplicateKey(error)) return { status: 'duplicate' }
    throw error
  }
  const link = await ensureDocLink(scope.orgId, { kind: 'invoice', docId: input.invoice._id, clientId: input.invoice.clientId })
  const result = await sendWorkspaceTemplate({
    orgId: scope.orgId,
    to: input.to,
    key,
    values,
    extras: { buttonValue: buttonSuffix(link.url, appUrl()) ?? 'app', payloads: docPayloads('invoice', link.url) },
    kind: 'reminder',
    event: 'folio.reminder_whatsapp',
    entity: 'Invoice',
    entityId: input.invoice._id,
    essential: true,
    defer: input.offsetDays !== null,
    title: `Reminder for ${input.invoice.number ?? 'an invoice'}`,
  })
  const failed = !result.ok && result.status !== 'queued'
  await scope.db(FolioMessage).updateOne({ _id: slot }, { $set: { status: failed ? 'failed' : 'sent', toAddress: input.to, outboxId: result.id && Types.ObjectId.isValid(result.id) ? new Types.ObjectId(result.id) : undefined, error: failed ? result.error : undefined, sentAt: failed ? undefined : new Date() } })
  return failed ? { status: 'failed', error: result.error } : { status: 'sent', messageId: result.id }
}
