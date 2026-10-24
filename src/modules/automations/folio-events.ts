import 'server-only'
import { Types } from 'mongoose'
import { formatDate } from '@/lib/dates'
import { scoped } from '@/lib/db/scoped'
import { formatINR } from '@/lib/money'
import { Client } from '@/models/Client'
import { FolioEntity } from '@/models/folio/Entity'
import { Invoice } from '@/models/folio/Invoice'
import { clientLabel, entityLabel } from '@/modules/folio/context'
import { ensureDocLink } from '@/modules/doclinks/links'
import { emitEvent } from './engine'
import { receiptPaymentVars, type PaidInvoice } from './payment-vars'
import type { RunSubject } from './types'

/**
 * Folio's events for the automation engine, with the values the money
 * recipes' wording uses. Called after the Folio write has committed; never
 * throws (emitEvent logs its own failures, and so do these).
 */

const id = (value: Types.ObjectId | string) => new Types.ObjectId(String(value))

async function invoiceVars(orgId: Types.ObjectId, invoiceId: Types.ObjectId | string, orgName?: string) {
  const db = <M extends Parameters<typeof scoped>[0]>(model: M) => scoped(model, orgId)
  const invoice = await db(Invoice).findById(id(invoiceId)).lean()
  if (!invoice) return null
  const [client, entity, link] = await Promise.all([
    db(Client).findById(invoice.clientId, { name: 1, displayName: 1 }).lean(),
    db(FolioEntity).findById(invoice.entityId, { legalName: 1, tradeName: 1 }).lean(),
    ensureDocLink(orgId, { kind: 'invoice', docId: invoice._id, clientId: invoice.clientId }),
  ])
  return {
    invoice,
    vars: {
      client_name: client ? clientLabel(client) : 'there',
      business_name: entity ? entityLabel(entity) : (orgName ?? ''),
      invoice_number: invoice.number ?? '',
      invoice_total: formatINR(invoice.totalPaise),
      balance_due: formatINR(invoice.balancePaise),
      balance_due_paise: invoice.balancePaise,
      due_date: formatDate(invoice.dueDate),
      document_link: link.url,
    },
  }
}

export type PaymentFacts = Readonly<{
  receiptId: Types.ObjectId | string
  receiptNumber: string
  clientId: Types.ObjectId | string
  receivedOn: string
  /** Allocations of this receipt (one event covers them all). */
  allocations: readonly { invoiceId: Types.ObjectId | string; amountPaise: number }[]
}>

/**
 * `payment.received` once per receipt (the thank-you and part-payment
 * recipes), covering every invoice it paid; the outbound `invoice.paid`
 * webhook still goes per invoice. Also called when a receipt's advance is
 * applied later, with just that allocation.
 */
export async function emitPaymentReceived(orgId: Types.ObjectId, facts: PaymentFacts): Promise<void> {
  try {
    const receiptLink = await ensureDocLink(orgId, { kind: 'receipt', docId: facts.receiptId, clientId: facts.clientId })
    const receiptVars = { receipt_number: facts.receiptNumber, receipt_link: receiptLink.url, payment_date: formatDate(facts.receivedOn) }
    const subjects: RunSubject[] = []
    const paid: PaidInvoice[] = []
    for (const a of facts.allocations.filter((x) => x.amountPaise > 0)) {
      const found = await invoiceVars(orgId, a.invoiceId)
      if (!found) continue
      const vars = { ...found.vars, ...receiptVars, amount: formatINR(a.amountPaise), amount_paise: a.amountPaise }
      paid.push({ number: found.invoice.number ?? '', balancePaise: found.invoice.balancePaise, amountPaise: a.amountPaise, vars })
      subjects.push({
        entity: 'Invoice',
        entityId: String(found.invoice._id),
        occurrence: String(facts.receiptId),
        vars,
        refs: { clientId: String(found.invoice.clientId), invoiceId: String(found.invoice._id), href: `/app/folio/receipts/${facts.receiptId}` },
      })
    }
    const vars = receiptPaymentVars(paid)
    if (!vars) return
    await emitEvent(orgId, 'payment.received', { ...subjects[0], vars }, subjects)
  } catch (error) {
    console.error('[automations] payment.received not emitted', String(facts.receiptId), error)
  }
}

/** `invoice.issued` (the "send to client" recipe). */
export async function emitInvoiceIssued(orgId: Types.ObjectId, invoiceId: Types.ObjectId | string): Promise<void> {
  try {
    const found = await invoiceVars(orgId, invoiceId)
    if (!found) return
    await emitEvent(orgId, 'invoice.issued', { entity: 'Invoice', entityId: String(found.invoice._id), vars: found.vars, refs: { clientId: String(found.invoice.clientId), invoiceId: String(found.invoice._id), href: `/app/folio/invoices/${found.invoice._id}` } })
  } catch (error) {
    console.error('[automations] invoice.issued not emitted', String(invoiceId), error)
  }
}

/** `payment.utr_shared`: the client says the invoice is paid (verify task). */
export async function emitUtrShared(orgId: Types.ObjectId, invoiceId: Types.ObjectId | string, input: { utr: string; amountPaise?: number | null; eventId: string }): Promise<void> {
  try {
    const found = await invoiceVars(orgId, invoiceId)
    if (!found) return
    await emitEvent(orgId, 'payment.utr_shared', {
      entity: 'Invoice',
      entityId: String(found.invoice._id),
      occurrence: input.eventId,
      vars: { ...found.vars, utr: input.utr, amount: input.amountPaise ? formatINR(input.amountPaise) : '' },
      refs: { clientId: String(found.invoice.clientId), invoiceId: String(found.invoice._id), href: `/app/folio/invoices/${found.invoice._id}` },
    })
  } catch (error) {
    console.error('[automations] payment.utr_shared not emitted', String(invoiceId), error)
  }
}

export type QuoteFacts = Readonly<{ quoteId: string; clientId: string; vars: Record<string, string | number> }>

/** `quote.accepted` (owner alert + convert task). */
export async function emitQuoteAccepted(orgId: Types.ObjectId, facts: QuoteFacts): Promise<void> {
  await emitEvent(orgId, 'quote.accepted', { entity: 'Quote', entityId: facts.quoteId, vars: facts.vars, refs: { clientId: facts.clientId, href: `/app/folio/quotes/${facts.quoteId}` } })
}

/** `invoice.recurring_generated` (review the drafts). */
export async function emitRecurringGenerated(orgId: Types.ObjectId, input: { count: number; month: string; asOf: string; orgName: string }): Promise<void> {
  await emitEvent(orgId, 'invoice.recurring_generated', {
    entity: 'RetainerRun',
    entityId: input.asOf,
    vars: { business_name: input.orgName, draft_count: input.count, month: input.month },
    refs: { href: '/app/folio/invoices?status=draft' },
  })
}
