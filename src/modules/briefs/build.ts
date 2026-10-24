import 'server-only'
import type { Ctx } from '@/lib/ctx'
import { allowedSections, sectionByKey } from './catalog'
import type { BuiltSection } from './schedule'
import { moneyBilling, moneyDues, moneyReceipts, salesClosing, salesFollowups, salesNewLeads } from './sections-business'
import { complianceNext7 } from './sections-compliance'
import { approvals, teamOverdue, teamToday } from './sections-team'
import { blocked, dueThisWeek, dueToday, meetingsToday, overdue, timesheet, type BriefFilters } from './sections-work'

/** Builds a brief's sections for one member, in their order, re-checking each against their permissions. */

type Builder = (ctx: Ctx, filters: BriefFilters, today: string) => Promise<BuiltSection>

const BUILDERS: Readonly<Record<string, Builder>> = {
  'work.due_today': dueToday,
  'work.overdue': overdue,
  'work.due_week': dueThisWeek,
  'work.blocked': (ctx, f) => blocked(ctx, f),
  'work.meetings': (ctx, _f, today) => meetingsToday(ctx, today),
  'work.timesheet': (ctx, _f, today) => timesheet(ctx, today),
  'approvals.pending': (ctx) => approvals(ctx),
  'team.today': (ctx) => teamToday(ctx),
  'team.overdue': (ctx, _f, today) => teamOverdue(ctx, today),
  'money.dues': (ctx, _f, today) => moneyDues(ctx, today),
  'money.receipts': (ctx, _f, today) => moneyReceipts(ctx, today),
  'money.billing': (ctx, _f, today) => moneyBilling(ctx, today),
  'sales.followups': (ctx, _f, today) => salesFollowups(ctx, today),
  'sales.new_leads': (ctx, _f, today) => salesNewLeads(ctx, today),
  'sales.closing': (ctx, _f, today) => salesClosing(ctx, today),
  'compliance.next7': (ctx, _f, today) => complianceNext7(ctx, today),
}

/** One failing section never sinks the brief: it is left out and logged. */
async function buildOne(key: string, ctx: Ctx, filters: BriefFilters, today: string): Promise<BuiltSection | null> {
  const builder = BUILDERS[key]
  if (!builder) return null
  try {
    return await builder(ctx, filters, today)
  } catch (error) {
    console.error(`[briefs] section ${key} failed for member ${String(ctx.memberId)}`, error)
    return { key, title: sectionByKey(key)?.label ?? key, lines: [] }
  }
}

export async function buildBrief(ctx: Ctx, sections: readonly string[], filters: BriefFilters, today: string): Promise<BuiltSection[]> {
  const keys = allowedSections(sections, ctx)
  const built = await Promise.all(keys.map((key) => buildOne(key, ctx, filters, today)))
  return built.filter((s): s is BuiltSection => s !== null)
}
