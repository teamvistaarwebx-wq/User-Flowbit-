import 'server-only'
import type { Ctx } from '@/lib/ctx'
import { escapeRegex } from '@/lib/utils'
import { McpIdempotency } from '@/models/mcp/McpIdempotency'
import { Employee } from '@/models/muster/Employee'
import { LeaveRequest } from '@/models/muster/LeaveRequest'
import { Member } from '@/models/Member'
import { Lead } from '@/models/orbit/Lead'
import { getFolioSettings, taxRatesOf } from '@/modules/folio/settings/queries'
import { OPEN_LEAD_STAGES } from '@/modules/orbit/constants'
import { leadAccess } from '@/modules/orbit/scope'
import { activeKeys, getOrbitSettings } from '@/modules/orbit/settings'
import { candidateById, candidatesFor, openTaskCandidates, recordLink } from '../data/candidates'
import { rankMatches, phoneDigits } from '../find/match'
import type { PlanLookups } from './planner'

/** The database side of the planner, read with the person's own ctx (their visibility, their workspace). */

const DUPLICATE_CONFIDENCE = 0.9

export function planLookups(ctx: Ctx): PlanLookups {
  return {
    find: async (kind, query) => rankMatches(query, await candidatesFor(ctx, kind, query)),
    byId: (kind, id) => candidateById(ctx, kind, id),
    async similarOpenTask(title) {
      const [top] = rankMatches(title, await openTaskCandidates(ctx, title), 1)
      return top && top.confidence >= DUPLICATE_CONFIDENCE ? top : null
    },
    async leadByContact(email, phone) {
      if (!ctx.has('orbit')) return null
      const or: Record<string, unknown>[] = []
      if (email) or.push({ email: email.trim().toLowerCase() })
      const digits = phone ? phoneDigits(phone).slice(-10) : ''
      if (digits.length >= 7) or.push({ phone: new RegExp(`${digits.split('').join('\\D*')}$`) })
      if (!or.length) return null
      const lead = await ctx.db(Lead).findOne({ $and: [leadAccess(ctx), { $or: or }] }, { companyName: 1 }).sort({ updatedAt: -1 }).lean()
      return lead ? { kind: 'lead', id: String(lead._id), name: lead.companyName, link: recordLink('lead', String(lead._id)) } : null
    },
    async openLeadByCompany(company) {
      if (!ctx.has('orbit')) return null
      const lead = await ctx.db(Lead).findOne({ stage: { $in: [...OPEN_LEAD_STAGES] }, companyName: new RegExp(`^${escapeRegex(company.trim())}$`, 'i') }, { companyName: 1 }).lean()
      return lead ? { kind: 'lead', id: String(lead._id), name: lead.companyName } : null
    },
    async idempotent(key) {
      const row = await ctx.db(McpIdempotency).findOne({ key }).lean()
      return row ? { label: row.label ?? row.model, link: recordLink(row.model === 'Task' ? 'task' : row.model === 'Lead' ? 'lead' : row.model === 'Deal' ? 'deal' : row.model === 'Invoice' ? 'invoice' : row.model === 'Quote' ? 'quote' : 'task', String(row.recordId)) } : null
    },
    async dealConfig() {
      const cfg = await getOrbitSettings(ctx)
      const active = (list: { key: string; label: string; active: boolean }[]) => list.filter((x) => x.active).map(({ key, label }) => ({ key, label }))
      return { stages: cfg.dealStages.map(({ key, label }) => ({ key, label })), lostReasons: active(cfg.lostReasons), wonReasons: active(cfg.wonReasons) }
    },
    async leadChoices() {
      const cfg = await getOrbitSettings(ctx)
      return { sources: activeKeys(cfg.sources), sectors: activeKeys(cfg.sectors) }
    },
    async onLeave(memberId, date) {
      if (!ctx.has('muster')) return false
      const member = await ctx.db(Member).findById(memberId, { employeeId: 1 }).lean()
      const employeeId = member?.employeeId ?? (await ctx.db(Employee).findOne({ memberId }, { _id: 1 }).lean())?._id
      if (!employeeId) return false
      return Boolean(await ctx.db(LeaveRequest).exists({ employeeId, status: 'approved', dates: date }))
    },
    async defaultGstRate() {
      if (!ctx.has('folio')) return 18
      const rates = taxRatesOf(await getFolioSettings(ctx))
      return rates.includes(18) ? 18 : (rates[rates.length - 1] ?? 0)
    },
  }
}
