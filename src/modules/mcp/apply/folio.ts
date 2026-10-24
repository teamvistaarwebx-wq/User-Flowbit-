import 'server-only'
import { audit } from '@/lib/audit'
import type { Ctx } from '@/lib/ctx'
import { addDays, todayIST } from '@/lib/dates'
import { UserError } from '@/lib/errors'
import { formatINR } from '@/lib/money'
import { notifyPermission } from '@/lib/notify'
import { defaultEntityId, loadProfile } from '@/modules/folio/context'
import type { LineInputRaw } from '@/modules/folio/invoices/schemas'
import { createDraftInvoice } from '@/modules/folio/invoices/service'
import { createQuote } from '@/modules/folio/quotes/service'
import { getFolioSettings } from '@/modules/folio/settings/queries'
import { recordLink } from '../data/candidates'
import type { ExecResult } from './types'

/**
 * Folio through MCP is draft only (owner default): a draft invoice holds no
 * number and a person issues it in the app; issuing, payments and voiding are
 * never reachable from here. GST is priced by Flowbit, exactly as the builder.
 */

export type DocLine = Readonly<{ description: string; quantity: number; rate: number; gstRatePercent: number; hsnSac?: string }>
export type DocPayload = Readonly<{ clientId: string; lines: DocLine[]; date?: string; validUntil?: string; notes?: string }>

const toLines = (lines: readonly DocLine[]): LineInputRaw[] =>
  lines.map((l) => ({ description: l.description, quantity: l.quantity, unit: 'nos', rate: l.rate, discountPercent: 0, gstRatePercent: l.gstRatePercent, hsnSac: l.hsnSac || undefined, serviceItemId: undefined }))

async function entityFor(ctx: Ctx, clientId: string): Promise<string> {
  const profile = await loadProfile(ctx, clientId)
  const entity = await defaultEntityId(ctx, profile)
  if (!entity) throw new UserError('Folio has no active firm yet. Add one in Folio settings first.')
  return String(entity)
}

export async function draftInvoiceMcp(ctx: Ctx, p: DocPayload, via: string): Promise<ExecResult> {
  ctx.assertWritable()
  ctx.assertProduct('folio')
  ctx.assert('invoices.write')
  const entityId = await entityFor(ctx, p.clientId)
  const created = await createDraftInvoice(ctx, { entityId, clientId: p.clientId, supplyMode: 'auto', lines: toLines(p.lines), discountType: 'none', discountValue: 0, issueDate: p.date ?? todayIST(), notes: p.notes })
  await audit(ctx, { action: 'invoice.draft_created', entity: 'Invoice', entityId: created.id, summary: `Drafted an invoice for ${created.clientName} (${formatINR(created.totalPaise)})`, product: 'folio', meta: { via } })
  if (!ctx.can('invoices.issue')) {
    await notifyPermission(ctx, 'invoices.issue', { title: `Draft invoice for ${created.clientName} (${formatINR(created.totalPaise, { decimals: 0 })}) is ready to issue`, href: `/app/folio/invoices/${created.id}`, kind: 'approval', product: 'folio', event: 'folio.draft_ready' })
  }
  return { model: 'Invoice', id: String(created.id), label: `Draft invoice for ${created.clientName} (${formatINR(created.totalPaise)})`, link: recordLink('invoice', String(created.id)), action: 'created', created: [{ model: 'Invoice', ids: [created.id] }], restore: [] }
}

export async function draftQuoteMcp(ctx: Ctx, p: DocPayload, via: string): Promise<ExecResult> {
  ctx.assertWritable()
  ctx.assertProduct('folio')
  ctx.assert('quotes.write')
  const entityId = await entityFor(ctx, p.clientId)
  const settings = await getFolioSettings(ctx)
  const quoteDate = p.date ?? todayIST()
  const validUntil = p.validUntil && p.validUntil >= quoteDate ? p.validUntil : addDays(quoteDate, settings.invoicing?.defaultValidityDays ?? 15)
  const quote = await createQuote(ctx, { entityId, clientId: p.clientId, supplyMode: 'auto', lines: toLines(p.lines), discountType: 'none', discountValue: 0, kind: 'quote', quoteDate, validUntil, notes: p.notes, subject: undefined, terms: undefined })
  await audit(ctx, { action: 'quote.created', entity: 'Quote', entityId: quote.id, summary: `Drafted quote ${quote.number}`, product: 'folio', meta: { via } })
  return { model: 'Quote', id: String(quote.id), label: `Draft quote ${quote.number}`, link: recordLink('quote', String(quote.id)), action: 'created', created: [{ model: 'Quote', ids: [quote.id] }], restore: [] }
}
