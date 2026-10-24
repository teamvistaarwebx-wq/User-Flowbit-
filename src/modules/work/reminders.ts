import 'server-only'
import type { Types } from 'mongoose'
import { eachOrg } from '@/lib/cron'
import type { Ctx } from '@/lib/ctx'
import { addDays } from '@/lib/dates'
import { notify, type NotifyInput } from '@/lib/notify'
import type { SystemDb } from '@/lib/platform'
import { canWrite } from '@/lib/entitlements'
import { Member } from '@/models/Member'
import { Task } from '@/models/work/Task'
import { daysOverdue } from '@/modules/work/tasks/due'

/**
 * Due-today and overdue reminders for open tasks. Idempotent (dedupeKey):
 * one "due today" per task and day, and an overdue nudge every 3 days, so the
 * Home page and the daily cron can both run them without repeats.
 */
const OVERDUE_REMINDER_EVERY = 3
const LOOKBACK_DAYS = 90
const PER_MEMBER_LIMIT = 30
const PER_ORG_LIMIT = 2000

type Scope = Pick<Ctx, 'orgId' | 'db'>
type DueTask = { _id: Types.ObjectId; title: string; dueDate?: string | null }

function reminderFor(t: DueTask, today: string): Omit<NotifyInput, 'userIds'> {
  const late = daysOverdue(t.dueDate, today)
  const bucket = Math.floor((late - 1) / OVERDUE_REMINDER_EVERY)
  return {
    title: late ? `'${t.title}' is ${late} day${late === 1 ? '' : 's'} overdue` : `'${t.title}' is due today`,
    href: `/app/work/tasks/${t._id}`,
    kind: 'reminder',
    product: 'work',
    event: late ? 'task.overdue' : 'task.due_today',
    action: { kind: 'task' as const, id: String(t._id) },
    dedupeKey: late ? `task-overdue:${t._id}:${bucket}` : `task-due:${t._id}:${today}`,
    includeSelf: true,
  }
}

const openDue = (today: string) => ({ status: { $ne: 'done' }, dueDate: { $lte: today, $gte: addDays(today, -LOOKBACK_DAYS) } })

/** One member's reminders (Home page, first visit of the day). */
export async function sendTaskReminders(scope: Scope, today: string, member: { memberId: Types.ObjectId; userId: Types.ObjectId }): Promise<void> {
  const tasks = await scope.db(Task).find({ ...openDue(today), assigneeIds: member.memberId }, { title: 1, dueDate: 1 }).limit(PER_MEMBER_LIMIT).lean()
  for (const t of tasks) await notify({ orgId: scope.orgId }, { ...reminderFor(t, today), userIds: [member.userId] })
}

/** Every assignee's reminders in one workspace (daily cron). Returns how many notifications were created. */
export async function sendOrgTaskReminders(scope: Scope, today: string): Promise<number> {
  const tasks = await scope.db(Task).find({ ...openDue(today), 'assigneeIds.0': { $exists: true } }, { title: 1, dueDate: 1, assigneeIds: 1 }).sort({ dueDate: -1 }).limit(PER_ORG_LIMIT).lean()
  if (!tasks.length) return 0
  const memberIds = [...new Set(tasks.flatMap((t) => (t.assigneeIds ?? []).map(String)))]
  const members = await scope.db(Member).find({ _id: { $in: memberIds }, status: 'active' }, { userId: 1 }).lean()
  const userOf = new Map(members.map((m) => [String(m._id), m.userId]))
  const sentPerMember = new Map<string, number>()
  let created = 0
  for (const t of tasks) {
    const assignees = (t.assigneeIds ?? []).map(String).filter((id) => userOf.has(id) && (sentPerMember.get(id) ?? 0) < PER_MEMBER_LIMIT)
    if (!assignees.length) continue
    assignees.forEach((id) => sentPerMember.set(id, (sentPerMember.get(id) ?? 0) + 1))
    created += await notify({ orgId: scope.orgId }, { ...reminderFor(t, today), userIds: assignees.map((id) => userOf.get(id)!) })
  }
  return created
}

/** Daily cron: task reminders for every workspace with Flowbit Work. */
export async function runTaskReminders(db: SystemDb, asOf: string) {
  const orgs = await eachOrg(db, 'task-reminders', (org) => canWrite(org, 'work'), (org) => sendOrgTaskReminders({ orgId: org._id, db: db.forOrg(org._id).db }, asOf))
  return { orgs }
}
