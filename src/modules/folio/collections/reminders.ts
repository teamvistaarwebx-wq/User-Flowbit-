import 'server-only'
import { Types } from 'mongoose'
import { emailBrandFor } from '@/lib/email-brand'
import { emailLayout, sendMail } from '@/lib/mail'
import { FolioEntity } from '@/models/folio/Entity'
import { FolioMessage } from '@/models/folio/MessageLog'
import { Invoice } from '@/models/folio/Invoice'
import { daysOverdue } from '@/modules/folio/engine/aging'
import { entityLabel } from '@/modules/folio/context'
import type { FolioScope } from '@/modules/folio/queries/common'
import { composeReminderEmail, composeReminderWhatsApp, type ComposedEmail, type PayTo } from './compose'
import { toneFor, type ReminderTone } from './schedule'

/** Shared by the automatic run and the manual reminder dialog. */

const invoiceFields = { number: 1, clientId: 1, entityId: 1, issueDate: 1, dueDate: 1, balancePaise: 1, totalPaise: 1, bank: 1, status: 1, billingType: 1 } as const

export async function loadReminderInvoices(scope: FolioScope, filter: Record<string, unknown>) {
  return scope.db(Invoice).find(filter, invoiceFields).sort({ dueDate: 1 }).lean()
}
export type ReminderInvoiceDoc = Awaited<ReturnType<typeof loadReminderInvoices>>[number]

export type SenderInfo = { sender: string; company: string; supportEmail: string | null; payTo: PayTo | null }

/** Who signs reminders for each entity, and where to pay (bank snapshot on the invoice wins). */
export async function senderInfo(scope: FolioScope, orgName: string): Promise<Map<string, SenderInfo>> {
  const entities = await scope.db(FolioEntity).find({}, { legalName: 1, tradeName: 1, signatoryName: 1, email: 1, bankAccounts: 1 }).lean()
  return new Map(
    entities.map((e) => {
      const bank = (e.bankAccounts ?? []).find((b) => b.isDefault) ?? e.bankAccounts?.[0]
      return [String(e._id), { sender: e.signatoryName || orgName, company: entityLabel(e), supportEmail: e.email ?? null, payTo: bank ? { bankName: bank.bankName, accountLast4: bank.accountNumber.slice(-4), ifsc: bank.ifsc, upiId: bank.upiId ?? null } : null }]
    }),
  )
}

export type ComposedReminder = { tone: ReminderTone; daysOverdue: number; email: ComposedEmail; whatsapp: string }

export function composeFor(inv: ReminderInvoiceDoc, sender: SenderInfo | undefined, orgName: string, recipientName: string | null, asOf: string): ComposedReminder {
  const days = daysOverdue(inv.dueDate, asOf)
  const snapshot = inv.bank?.bankName ? { bankName: inv.bank.bankName, accountLast4: (inv.bank.accountNumber ?? '').slice(-4) || null, ifsc: inv.bank.ifsc ?? null, upiId: inv.bank.upiId ?? null } : null
  const input = {
    tone: toneFor(days),
    daysOverdue: days,
    invoiceNumber: inv.number ?? 'Invoice',
    issueDate: inv.issueDate,
    dueDate: inv.dueDate,
    balancePaise: inv.balancePaise ?? 0,
    recipientName,
    sender: sender?.sender ?? orgName,
    company: sender?.company ?? orgName,
    supportEmail: sender?.supportEmail ?? null,
    payTo: snapshot ?? sender?.payTo ?? null,
  }
  return { tone: input.tone, daysOverdue: days, email: composeReminderEmail(input), whatsapp: composeReminderWhatsApp(input) }
}

export const isDuplicateKey = (error: unknown): boolean => typeof error === 'object' && error !== null && (error as { code?: number }).code === 11000

type EmailJob = {
  orgId: Types.ObjectId
  invoice: ReminderInvoiceDoc
  to: string
  subject: string
  paragraphs: string[]
  /** null for a manual reminder (not part of the automatic cadence). */
  offsetDays: number | null
  sentBy?: Types.ObjectId | null
}

export type EmailOutcome = { status: 'sent' | 'logged' | 'failed' | 'duplicate'; messageId: string | null; error?: string }

/**
 * Claims the message slot first (the partial unique index on invoice +
 * channel + offset), then sends, then records the outcome. A second run that
 * reaches the same reminder fails the claim and sends nothing.
 */
export async function sendReminderEmail(scope: FolioScope, job: EmailJob): Promise<EmailOutcome> {
  const base = { kind: 'reminder' as const, clientId: job.invoice.clientId, invoiceId: job.invoice._id, channel: 'email' as const, offsetDays: job.offsetDays, toAddress: job.to, subject: job.subject, body: job.paragraphs.join('\n\n'), sentBy: job.sentBy ?? undefined }
  let messageId: Types.ObjectId
  try {
    const claimed = await scope.db(FolioMessage).create({ ...base, status: 'queued' })
    messageId = claimed._id
  } catch (error) {
    if (isDuplicateKey(error)) return { status: 'duplicate', messageId: null }
    throw error
  }
  const layout = emailLayout({ title: job.subject, paragraphs: job.paragraphs, brand: await emailBrandFor(job.orgId) })
  // retry: false — a failed reminder stays 'failed' here and the Folio cron sends it again, so the pipeline must not also retry it.
  const result = await sendMail({ to: job.to, subject: job.subject, ...layout, orgId: job.orgId, kind: 'reminder', entity: 'Invoice', entityId: job.invoice._id, retry: false })
  const status = !result.ok ? 'failed' : result.provider === 'resend' ? 'sent' : 'logged'
  await scope.db(FolioMessage).updateOne(
    { _id: messageId },
    { $set: { status, outboxId: Types.ObjectId.isValid(result.id) ? new Types.ObjectId(result.id) : undefined, error: result.error, sentAt: result.ok ? new Date() : undefined } },
  )
  return { status, messageId: String(messageId), error: result.error }
}
