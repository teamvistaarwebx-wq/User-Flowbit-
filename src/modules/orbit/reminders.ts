import 'server-only'
import type { Types } from 'mongoose'
import { eachOrg } from '@/lib/cron'
import type { Ctx } from '@/lib/ctx'
import { formatDate, todayIST } from '@/lib/dates'
import { notify } from '@/lib/notify'
import type { SystemDb } from '@/lib/platform'
import { canWrite } from '@/lib/entitlements'
import { Member } from '@/models/Member'
import { Activity } from '@/models/orbit/Activity'
import { ACTIVITY_LABEL, type ActivityType } from './constants'

/**
 * Follow-up reminders: one notification per planned activity and due date
 * when it is due today or overdue (deduplicated, so opening Orbit repeatedly
 * or the daily cron never repeats a reminder).
 */
const MAX_REMINDERS = 20
const PER_ORG_LIMIT = 2000

type Scope = Pick<Ctx, 'orgId' | 'db'>
type DueActivity = { _id: Types.ObjectId; title?: string | null; type: string; dueDate?: string | null; leadId?: unknown; dealId?: unknown }

async function remind(scope: Scope, a: DueActivity, userId: Types.ObjectId, today: string): Promise<number> {
  const label = ACTIVITY_LABEL[a.type as ActivityType]
  const href = a.dealId ? `/app/orbit/deals/${a.dealId}` : a.leadId ? `/app/orbit/leads/${a.leadId}` : '/app/orbit/activities'
  return notify({ orgId: scope.orgId }, {
    userIds: [userId],
    includeSelf: true,
    title: a.dueDate === today ? `${label} due today: ${a.title || label}` : `Overdue ${label}: ${a.title || label} (due ${formatDate(a.dueDate ?? today, { short: true })})`,
    href,
    kind: 'reminder',
    product: 'orbit',
    event: 'orbit.followup_due',
    dedupeKey: `orbit-followup:${a._id}:${a.dueDate}`,
  })
}

const FIELDS = { title: 1, type: 1, dueDate: 1, leadId: 1, dealId: 1, assigneeId: 1 } as const

/** The signed-in member's reminders; called when Orbit's dashboard or activities page loads. */
export async function remindDueFollowUps(ctx: Ctx): Promise<void> {
  const today = todayIST()
  const due = await ctx.db(Activity).find({ status: 'planned', assigneeId: ctx.memberId, dueDate: { $lte: today } }, FIELDS).sort({ dueDate: 1 }).limit(MAX_REMINDERS).lean()
  for (const a of due) await remind(ctx, a, ctx.userId, today)
}

/** Every assignee's reminders in one workspace (daily cron). Returns how many notifications were created. */
export async function remindOrgFollowUps(scope: Scope, today: string): Promise<number> {
  const due = await scope.db(Activity).find({ status: 'planned', assigneeId: { $ne: null }, dueDate: { $lte: today } }, FIELDS).sort({ dueDate: 1 }).limit(PER_ORG_LIMIT).lean()
  if (!due.length) return 0
  const members = await scope.db(Member).find({ _id: { $in: [...new Set(due.map((a) => String(a.assigneeId)))] }, status: 'active' }, { userId: 1 }).lean()
  const userOf = new Map(members.map((m) => [String(m._id), m.userId]))
  const sent = new Map<string, number>()
  let created = 0
  for (const a of due) {
    const memberId = String(a.assigneeId)
    const userId = userOf.get(memberId)
    if (!userId || (sent.get(memberId) ?? 0) >= MAX_REMINDERS) continue
    sent.set(memberId, (sent.get(memberId) ?? 0) + 1)
    created += await remind(scope, a, userId, today)
  }
  return created
}

/** Daily cron: follow-up reminders for every workspace with Orbit. */
export async function runFollowUpReminders(db: SystemDb, asOf: string) {
  const orgs = await eachOrg(db, 'follow-up-reminders', (org) => canWrite(org, 'orbit'), (org) => remindOrgFollowUps({ orgId: org._id, db: db.forOrg(org._id).db }, asOf))
  return { orgs }
}
