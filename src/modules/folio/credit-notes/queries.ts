import 'server-only'
import type { Ctx } from '@/lib/ctx'
import { parseListParams, type SearchParams } from '@/lib/list'
import { escapeRegex } from '@/lib/utils'
import { Client } from '@/models/Client'
import { CreditNote } from '@/models/folio/CreditNote'
import { Invoice } from '@/models/folio/Invoice'
import { urlId } from '../invoices/queries'
import { PAGE_SIZE } from '../types'

/** The credit note list: `q`, `client`, `status`, `from`/`to`. */
export async function listCreditNotes(ctx: Ctx, sp: SearchParams) {
  const p = parseListParams(sp, { pageSize: PAGE_SIZE })
  const filter: Record<string, unknown> = {}
  if (p.get('status')) filter.status = p.get('status')
  const client = p.get('client')
  if (client) filter.clientId = urlId(client)
  const from = p.get('from')
  const to = p.get('to')
  if (from || to) filter.noteDate = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) }
  if (p.q) {
    const re = new RegExp(escapeRegex(p.q), 'i')
    const [clientIds, invoiceIds] = await Promise.all([ctx.db(Client).distinct('_id', { name: re }), ctx.db(Invoice).distinct('_id', { number: re })])
    filter.$or = [{ number: re }, { reasonText: re }, { clientId: { $in: clientIds } }, { invoiceId: { $in: invoiceIds } }]
  }
  const [rows, total] = await Promise.all([
    ctx.db(CreditNote).find(filter, { lines: 0 }).sort({ noteDate: -1, createdAt: -1 }).skip(p.skip).limit(p.pageSize).lean(),
    ctx.db(CreditNote).countDocuments(filter),
  ])
  const [clients, invoices] = await Promise.all([
    ctx.db(Client).find({ _id: { $in: rows.map((r) => r.clientId) } }, { name: 1 }).lean(),
    ctx.db(Invoice).find({ _id: { $in: rows.map((r) => r.invoiceId) } }, { number: 1 }).lean(),
  ])
  const clientName = new Map(clients.map((c) => [String(c._id), c.name]))
  const invoiceNumber = new Map(invoices.map((i) => [String(i._id), i.number ?? '']))
  return { p, total, rows: rows.map((r) => ({ ...r, clientName: clientName.get(String(r.clientId)) ?? 'Unknown client', invoiceNumber: invoiceNumber.get(String(r.invoiceId)) ?? '' })) }
}

export type CreditNoteRow = Awaited<ReturnType<typeof listCreditNotes>>['rows'][number]

/** Invoices a credit note can be raised against, for the picker: issued or part paid. A paid one has nothing left to credit until a payment is released. */
export async function creditableInvoices(ctx: Ctx, q: string) {
  const filter: Record<string, unknown> = { status: { $in: ['issued', 'part_paid'] }, billingType: { $ne: 'opening' } }
  if (q) filter.number = new RegExp(escapeRegex(q), 'i')
  const rows = await ctx.db(Invoice).find(filter, { number: 1, clientId: 1, totalPaise: 1, issueDate: 1, status: 1 }).sort({ issueDate: -1 }).limit(20).lean()
  const clients = await ctx.db(Client).find({ _id: { $in: rows.map((r) => r.clientId) } }, { name: 1 }).lean()
  const names = new Map(clients.map((c) => [String(c._id), c.name]))
  return rows.map((r) => ({ id: String(r._id), number: r.number ?? '', clientName: names.get(String(r.clientId)) ?? '', totalPaise: r.totalPaise, issueDate: r.issueDate, status: r.status }))
}
