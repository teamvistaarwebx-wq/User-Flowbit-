import { isValidObjectId } from 'mongoose'
import type { NextRequest } from 'next/server'
import { blockedResponse, getCtx, routeRefused } from '@/lib/ctx'
import { formatDate, todayIST } from '@/lib/dates'
import { paiseToRupees } from '@/lib/money'
import { Lead } from '@/models/orbit/Lead'
import { LEAD_STAGE_LABEL, labelFrom, type LeadStage } from '@/modules/orbit/constants'
import { csvResponse, toCsv } from '@/modules/orbit/csv'
import { leadFilter, parseLeadQuery } from '@/modules/orbit/leads.queries'
import { daysAgo } from '@/modules/orbit/metrics'
import { nameOf, orbitPeople, peopleIndex } from '@/modules/orbit/people'
import { leadAccess } from '@/modules/orbit/scope'
import { getOrbitSettings } from '@/modules/orbit/settings'

export const runtime = 'nodejs'
export const maxDuration = 300

const MAX_ROWS = 10_000
const HEADERS = ['Company', 'Contact', 'Designation', 'Email', 'Phone', 'LinkedIn', 'Instagram', 'Website', 'Sector', 'Source', 'Stage', 'Owner', 'Reviewer', 'ICP Score', 'Est Value', 'Next Action', 'Next Action Date', 'Close Reason', 'Last touch (days)', 'Created']

/** CSV of the leads list (same filters and scope as the page), or of selected ids. */
export async function GET(req: NextRequest) {
  const ctx = await getCtx()
  if (routeRefused(ctx)) return blockedResponse()
  if (!ctx || !ctx.has('orbit') || !ctx.can('orbit.read')) return new Response('Not allowed', { status: 403 })
  const sp = Object.fromEntries(req.nextUrl.searchParams.entries())
  const [cfg, people] = await Promise.all([getOrbitSettings(ctx), orbitPeople(ctx)])
  const index = peopleIndex(people)
  const ids = (sp.ids ?? '').split(',').filter((id) => isValidObjectId(id))
  const filter = ids.length ? { _id: { $in: ids }, ...leadAccess(ctx) } : leadFilter(ctx, parseLeadQuery(sp), cfg)
  const leads = await ctx.db(Lead).find(filter).sort({ updatedAt: -1 }).limit(MAX_ROWS).lean()
  const rows = leads.map((l) => [
    l.companyName, l.contactName, l.designation, l.email, l.phone, l.linkedinUrl, l.instagramHandle ? `@${l.instagramHandle}` : '', l.website,
    labelFrom(cfg.sectors, l.sector), labelFrom(cfg.sources, l.source), LEAD_STAGE_LABEL[l.stage as LeadStage] ?? l.stage,
    nameOf(index, l.ownerId), l.reviewerId ? nameOf(index, l.reviewerId) : '', l.icpScore ?? '', l.valuePaise ? paiseToRupees(l.valuePaise) : '',
    l.nextFollowUp?.title ?? '', l.nextFollowUp?.dueDate ?? '', l.closeReason ? `${labelFrom(cfg.lostReasons, l.closeReason.code)}${l.closeReason.note ? ` — ${l.closeReason.note}` : ''}` : '',
    daysAgo(l.lastActivityAt ?? l.createdAt), formatDate(l.createdAt),
  ])
  return csvResponse(toCsv(HEADERS, rows), `orbit-leads-${todayIST()}.csv`)
}
