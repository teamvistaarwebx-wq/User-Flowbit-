import 'server-only'
import type { Ctx } from '@/lib/ctx'
import { addDays, formatDate } from '@/lib/dates'
import { pluralize } from '@/lib/utils'
import { dueDatesBetween } from '@/modules/compliance/rules'
import { loadComplianceSettings } from '@/modules/compliance/store'
import { LINES_PER_SECTION } from './sections-work'
import type { BuiltSection } from './schedule'

/** The Compliance section of a brief: statutory due dates in the next 7 days, from the workspace's calendar. */
export async function complianceNext7(ctx: Ctx, today: string): Promise<BuiltSection> {
  const items = dueDatesBetween(await loadComplianceSettings(ctx.orgId), today, addDays(today, 7))
  const lines = items.slice(0, LINES_PER_SECTION).map((d) => ({ text: `${d.label} · ${d.periodLabel}`, href: '/app/settings/compliance', meta: `${d.dueDate === today ? 'Today' : formatDate(d.dueDate, { short: true })}${d.extended ? ' (extended)' : ''}` }))
  return { key: 'compliance.next7', title: 'Statutory dates', lines, summary: lines.length ? pluralize(items.length, 'due date') + ' this week' : undefined, href: '/app/settings/compliance' }
}
