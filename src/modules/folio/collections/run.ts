import 'server-only'
import type { Types } from 'mongoose'
import { Client } from '@/models/Client'
import { FolioBillingProfile } from '@/models/folio/BillingProfile'
import { FolioMessage } from '@/models/folio/MessageLog'
import { getFolioSettings } from '@/modules/folio/settings/queries'
import type { FolioScope } from '@/modules/folio/queries/common'
import { addressOf, recipientsFor, reminderRecipient, type Recipient } from './recipients'
import { composeFor, isDuplicateKey, loadReminderInvoices, sendReminderEmail, senderInfo } from './reminders'
import { REMINDER_CHANNELS, remindersDue, type ReminderChannel, type ReminderSettings } from './schedule'
import { isWhatsAppConnected } from '@/modules/whatsapp/connection'
import { sendReminderTemplate } from '@/modules/whatsapp/reminder-send'

/**
 * The automatic reminder run for one workspace (folio.md 6.14). Idempotent:
 * every reminder claims a unique (invoice, channel, offset) slot before it is
 * sent, so overlapping or repeated runs never send the same reminder twice,
 * and catch-up sends only the latest missed offset. WhatsApp reminders go
 * from the workspace's own number when it is connected (WhatsApp B), else
 * they wait in the Collections queue for someone to send by hand (wa.me).
 */

export type RunResult = { considered: number; sent: number; logged: number; queued: number; failed: number; skipped: string[] }

const LOGGED_STATUSES = ['sent', 'logged', 'queued', 'skipped']

async function excludedClients(scope: FolioScope): Promise<Set<string>> {
  const [paused, inactive] = await Promise.all([scope.db(FolioBillingProfile).find({ remindersPaused: true }, { clientId: 1 }).lean(), scope.db(Client).find({ status: 'inactive' }, { _id: 1 }).lean()])
  return new Set([...paused.map((p) => String(p.clientId)), ...inactive.map((c) => String(c._id))])
}

async function readSettings(scope: FolioScope): Promise<ReminderSettings> {
  const s = await getFolioSettings(scope)
  const channels = (s.reminders?.channels ?? ['email']).filter((c): c is ReminderChannel => (REMINDER_CHANNELS as readonly string[]).includes(c))
  return { enabled: s.reminders?.enabled !== false, offsetDays: s.reminders?.offsetDays ?? [], channels }
}

async function logSkip(scope: FolioScope, invoice: { _id: Types.ObjectId; clientId: Types.ObjectId }, channel: ReminderChannel, offsetDays: number): Promise<boolean> {
  try {
    await scope.db(FolioMessage).create({ kind: 'reminder', clientId: invoice.clientId, invoiceId: invoice._id, channel, offsetDays, status: 'skipped', toAddress: '', subject: 'Skipped: a later reminder replaced it' })
    return true
  } catch (error) {
    if (isDuplicateKey(error)) return false
    throw error
  }
}

export async function runReminders(scope: FolioScope & { orgName: string }, asOf: string): Promise<RunResult> {
  const result: RunResult = { considered: 0, sent: 0, logged: 0, queued: 0, failed: 0, skipped: [] }
  const settings = await readSettings(scope)
  if (!settings.enabled) return result
  const excluded = await excludedClients(scope)
  const invoices = (await loadReminderInvoices(scope, { status: { $in: ['issued', 'part_paid'] }, balancePaise: { $gt: 0 }, billingType: { $ne: 'opening' } })).filter((i) => !excluded.has(String(i.clientId)))
  if (!invoices.length) return result
  const logged = await scope.db(FolioMessage).find({ kind: 'reminder', invoiceId: { $in: invoices.map((i) => i._id) }, offsetDays: { $type: 'number' }, status: { $in: LOGGED_STATUSES } }, { invoiceId: 1, channel: 1, offsetDays: 1 }).lean()
  const due = remindersDue(
    invoices.map((i) => ({ invoiceId: String(i._id), dueDate: i.dueDate, balancePaise: i.balancePaise ?? 0 })),
    settings,
    logged.map((l) => ({ invoiceId: String(l.invoiceId), channel: l.channel as ReminderChannel, offsetDays: l.offsetDays as number })),
    asOf,
  )
  const byId = new Map(invoices.map((i) => [String(i._id), i]))
  const senders = await senderInfo(scope, scope.orgName)
  const recipientCache = new Map<string, Recipient[]>()
  const whatsappConnected = due.some((d) => d.channel === 'whatsapp') && (await isWhatsAppConnected(scope.orgId))
  result.considered = due.length

  for (const d of due) {
    const inv = byId.get(d.invoiceId)
    if (!inv) continue
    if (d.skip) {
      await logSkip(scope, inv, d.channel, d.offsetDays)
      continue
    }
    const clientKey = String(inv.clientId)
    const list = recipientCache.get(clientKey) ?? (await recipientsFor(scope, inv.clientId))
    recipientCache.set(clientKey, list)
    const to = reminderRecipient(list, d.channel)
    const address = to ? addressOf(to, d.channel) : null
    if (!to || !address) {
      result.skipped.push(`${inv.number}: no ${d.channel === 'email' ? 'email' : 'WhatsApp'} contact set to receive reminders`)
      continue
    }
    const composed = composeFor(inv, senders.get(String(inv.entityId)), scope.orgName, to.name, asOf)
    if (d.channel === 'email') {
      const outcome = await sendReminderEmail(scope, { orgId: scope.orgId, invoice: inv, to: address, subject: composed.email.subject, paragraphs: composed.email.paragraphs, offsetDays: d.offsetDays })
      if (outcome.status === 'sent') result.sent += 1
      else if (outcome.status === 'logged') result.logged += 1
      else if (outcome.status === 'failed') result.failed += 1
      continue
    }
    if (whatsappConnected) {
      // The workspace's own number (WhatsApp B): the approved reminder template, charged to its wallet.
      const sent = await sendReminderTemplate(scope, { invoice: inv, to: address, recipientName: to.name, business: senders.get(String(inv.entityId))?.company ?? scope.orgName, asOf, offsetDays: d.offsetDays })
      if (sent.status === 'sent') result.sent += 1
      else if (sent.status === 'failed') result.failed += 1
      continue
    }
    try {
      await scope.db(FolioMessage).create({ kind: 'reminder', clientId: inv.clientId, invoiceId: inv._id, channel: 'whatsapp', offsetDays: d.offsetDays, status: 'queued', toAddress: address, body: composed.whatsapp })
      result.queued += 1
    } catch (error) {
      if (!isDuplicateKey(error)) throw error
    }
  }
  return result
}
