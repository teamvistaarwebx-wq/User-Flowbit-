import 'server-only'
import type { Ctx } from '@/lib/ctx'
import { addDays, dayBoundsIST, formatDate, formatMonth, monthOf, monthRange } from '@/lib/dates'
import { formatINR } from '@/lib/money'
import { pluralize } from '@/lib/utils'
import { Invoice } from '@/models/folio/Invoice'
import { FolioReceipt } from '@/models/folio/Receipt'
import { Activity } from '@/models/orbit/Activity'
import { Deal } from '@/models/orbit/Deal'
import { Lead } from '@/models/orbit/Lead'
import { balancesByClient } from '@/modules/folio/queries/balances'
import { BILLED_STATUSES } from '@/modules/folio/queries/common'
import { LINES_PER_SECTION } from './sections-work'
import type { BriefLine, BuiltSection } from './schedule'

/** Money (Folio) and Sales (Orbit) sections of a brief. */

const TOP_CLIENTS = 5
const inr = (paise: number) => formatINR(paise, { decimals: 0 })

export async function moneyDues(ctx: Ctx, today: string): Promise<BuiltSection> {
  const [balances, dueToday] = await Promise.all([
    balancesByClient(ctx, today),
    ctx.db(Invoice).aggregate<{ n: number; paise: number }>([{ $match: { status: { $in: ['issued', 'part_paid'] }, dueDate: today, balancePaise: { $gt: 0 } } }, { $group: { _id: null, n: { $sum: 1 }, paise: { $sum: '$balancePaise' } } }]),
  ])
  const overdue = balances.filter((b) => b.overduePaise > 0).sort((a, b) => b.overduePaise - a.overduePaise)
  const overduePaise = overdue.reduce((s, b) => s + b.overduePaise, 0)
  const today$ = dueToday[0]
  const lines: BriefLine[] = [
    ...(today$?.n ? [{ text: `${pluralize(today$.n, 'invoice')} due today`, href: '/app/folio/invoices', meta: inr(today$.paise) }] : []),
    ...overdue.slice(0, TOP_CLIENTS).map((b) => ({ text: b.clientName, href: `/app/clients/${b.clientId}`, meta: `${inr(b.overduePaise)} overdue` })),
  ]
  return { key: 'money.dues', title: 'Due and overdue', lines, summary: overduePaise ? `${inr(overduePaise)} overdue` : undefined, href: '/app/folio/collections' }
}

export async function moneyReceipts(ctx: Ctx, today: string): Promise<BuiltSection> {
  const yesterday = addDays(today, -1)
  const rows = await ctx.db(FolioReceipt).aggregate<{ n: number; paise: number }>([{ $match: { status: 'recorded', receivedOn: yesterday } }, { $group: { _id: null, n: { $sum: 1 }, paise: { $sum: '$amountPaise' } } }])
  const r = rows[0]
  const lines = r?.n ? [{ text: `${pluralize(r.n, 'receipt')} on ${formatDate(yesterday, { short: true })}`, href: '/app/folio/receipts', meta: inr(r.paise) }] : []
  return { key: 'money.receipts', title: "Yesterday's receipts", lines, summary: r?.n ? `${inr(r.paise)} received` : undefined }
}

export async function moneyBilling(ctx: Ctx, today: string): Promise<BuiltSection> {
  const { start } = monthRange(monthOf(today))
  const rows = await ctx.db(Invoice).aggregate<{ n: number; paise: number }>([
    { $match: { status: { $in: [...BILLED_STATUSES] }, billingType: { $ne: 'opening' }, issueDate: { $gte: start, $lte: today } } },
    { $group: { _id: null, n: { $sum: 1 }, paise: { $sum: '$totalPaise' } } },
  ])
  const r = rows[0]
  const lines = r?.n ? [{ text: `${inr(r.paise)} billed in ${formatMonth(monthOf(today))} so far`, href: '/app/folio/invoices', meta: pluralize(r.n, 'invoice') }] : []
  return { key: 'money.billing', title: "This month's billing", lines }
}

const owned = (ctx: Ctx, field: string) => (ctx.can('orbit.view_all') ? {} : { [field]: ctx.memberId })

export async function salesFollowups(ctx: Ctx, today: string): Promise<BuiltSection> {
  const rows = await ctx.db(Activity).find({ status: 'planned', assigneeId: ctx.memberId, dueDate: { $lte: today } }, { title: 1, type: 1, dueDate: 1, leadId: 1, dealId: 1 }).sort({ dueDate: 1 }).limit(LINES_PER_SECTION).lean()
  const lines = rows.map((a) => ({
    text: a.title || a.type,
    href: a.dealId ? `/app/orbit/deals/${String(a.dealId)}` : a.leadId ? `/app/orbit/leads/${String(a.leadId)}` : '/app/orbit/activities',
    meta: a.dueDate === today ? 'Today' : `Since ${formatDate(a.dueDate ?? today, { short: true })}`,
  }))
  return { key: 'sales.followups', title: 'Follow-ups due', lines, summary: lines.length ? pluralize(lines.length, 'follow-up') : undefined, href: '/app/orbit/activities' }
}

export async function salesNewLeads(ctx: Ctx, today: string): Promise<BuiltSection> {
  const { start, end } = dayBoundsIST(addDays(today, -1))
  const rows = await ctx.db(Lead).find({ createdAt: { $gte: start, $lt: end }, ...owned(ctx, 'ownerId') }, { companyName: 1, source: 1 }).sort({ createdAt: -1 }).limit(LINES_PER_SECTION).lean()
  const lines = rows.map((l) => ({ text: l.companyName, href: `/app/orbit/leads/${String(l._id)}`, meta: l.source }))
  return { key: 'sales.new_leads', title: 'New leads yesterday', lines, summary: lines.length ? pluralize(lines.length, 'new lead') : undefined }
}

export async function salesClosing(ctx: Ctx, today: string): Promise<BuiltSection> {
  const rows = await ctx.db(Deal).find({ status: 'open', expectedCloseDate: { $gte: today, $lte: addDays(today, 7) }, ...owned(ctx, 'ownerId') }, { title: 1, valuePaise: 1, expectedCloseDate: 1 }).sort({ expectedCloseDate: 1 }).limit(LINES_PER_SECTION).lean()
  const lines = rows.map((d) => ({ text: d.title, href: `/app/orbit/deals/${String(d._id)}`, meta: `${inr(d.valuePaise)} · ${formatDate(d.expectedCloseDate ?? today, { short: true })}` }))
  return { key: 'sales.closing', title: 'Closing this week', lines, summary: lines.length ? pluralize(lines.length, 'deal') + ' closing' : undefined }
}
