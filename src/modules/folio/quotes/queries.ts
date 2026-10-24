import 'server-only'
import type { Ctx } from '@/lib/ctx'
import { todayIST } from '@/lib/dates'
import { parseListParams, type SearchParams } from '@/lib/list'
import { escapeRegex } from '@/lib/utils'
import { Client } from '@/models/Client'
import { Quote } from '@/models/folio/Quote'
import { urlId } from '../invoices/queries'
import { PAGE_SIZE } from '../types'

/** The quote list: `q`, `status` (incl. derived "expired"), `kind`, `client`. */
export async function listQuotes(ctx: Ctx, sp: SearchParams) {
  const p = parseListParams(sp, { pageSize: PAGE_SIZE })
  const today = todayIST()
  const filter: Record<string, unknown> = {}
  const status = p.get('status')
  if (status === 'expired') Object.assign(filter, { status: { $in: ['draft', 'sent'] }, validUntil: { $lt: today } })
  else if (status) filter.status = status
  if (p.get('kind')) filter.kind = p.get('kind')
  const client = p.get('client')
  if (client) filter.clientId = urlId(client)
  if (p.q) {
    const re = new RegExp(escapeRegex(p.q), 'i')
    const clientIds = await ctx.db(Client).distinct('_id', { name: re })
    filter.$or = [{ number: re }, { subject: re }, { clientId: { $in: clientIds } }]
  }
  const [rows, total] = await Promise.all([
    ctx.db(Quote).find(filter, { lines: 0 }).sort({ quoteDate: -1, createdAt: -1 }).skip(p.skip).limit(p.pageSize).lean(),
    ctx.db(Quote).countDocuments(filter),
  ])
  const clients = await ctx.db(Client).find({ _id: { $in: rows.map((r) => r.clientId) } }, { name: 1 }).lean()
  const names = new Map(clients.map((c) => [String(c._id), c.name]))
  return { p, total, rows: rows.map((r) => ({ ...r, clientName: names.get(String(r.clientId)) ?? 'Unknown client' })) }
}

export type QuoteListRow = Awaited<ReturnType<typeof listQuotes>>['rows'][number]
