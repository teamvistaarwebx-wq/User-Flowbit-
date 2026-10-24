import 'server-only'
import type { Ctx } from '@/lib/ctx'
import { oid } from '@/lib/serialize'
import { escapeRegex } from '@/lib/utils'
import { Employee } from '@/models/muster/Employee'
import { Holiday } from '@/models/muster/Holiday'
import { LeaveRequest } from '@/models/muster/LeaveRequest'
import { Task } from '@/models/work/Task'
import { TimeEntry } from '@/models/work/TimeEntry'
import { Team } from '@/models/work/Team'
import { listPeople, peopleMap } from './people'
import { loadPercent, memberCapacityMinutes, openTaskStats, type LeaveSpan, type WorkloadTask } from './workload'

export type TeamCardData = {
  id: string
  name: string
  description?: string
  color: string
  isPrivate: boolean
  lead?: { id: string; name: string }
  people: { id: string; name: string }[]
  isMember: boolean
  openTasks: number
}

/** The team directory (everyone sees it) with members and open task counts. */
export async function listTeams(ctx: Ctx, q: string): Promise<TeamCardData[]> {
  const teams = await ctx.db(Team).find(q ? { name: new RegExp(escapeRegex(q), 'i') } : {}).sort({ name: 1 }).lean()
  const people = await peopleMap(ctx, teams.flatMap((t) => t.members.map((m) => m.memberId)))
  const me = String(ctx.memberId)
  return Promise.all(
    teams.map(async (t) => {
      const ids = t.members.map((m) => m.memberId)
      const lead = t.members.find((m) => m.role === 'lead')
      const openTasks = ids.length ? await ctx.db(Task).countDocuments({ assigneeIds: { $in: ids }, status: { $ne: 'done' }, isPersonal: { $ne: true } }) : 0
      return {
        id: String(t._id),
        name: t.name,
        description: t.description ?? undefined,
        color: t.color ?? '#C084FC',
        isPrivate: Boolean(t.isPrivate),
        lead: lead ? { id: String(lead.memberId), name: people.get(String(lead.memberId))?.name ?? 'Former member' } : undefined,
        people: ids.map((id) => ({ id: String(id), name: people.get(String(id))?.name ?? 'Former member' })),
        isMember: ids.some((id) => String(id) === me),
        openTasks,
      }
    }),
  )
}

export async function teamDetail(ctx: Ctx, id: string) {
  const team = await ctx.db(Team).findById(id).lean()
  if (!team) return null
  const [people, everyone] = await Promise.all([peopleMap(ctx, team.members.map((m) => m.memberId)), listPeople(ctx)])
  const members = team.members.map((m) => {
    const p = people.get(String(m.memberId))
    return { id: String(m.memberId), name: p?.name ?? 'Former member', title: p?.title, department: p?.department, role: m.role, joinedAt: m.joinedAt.toISOString() }
  })
  return {
    id: String(team._id),
    name: team.name,
    description: team.description ?? '',
    color: team.color ?? '#C084FC',
    isPrivate: Boolean(team.isPrivate),
    members,
    candidates: everyone.filter((p) => !members.some((m) => m.id === p.id)),
    isMember: members.some((m) => m.id === String(ctx.memberId)),
  }
}

export type WorkloadRow = {
  id: string
  name: string
  open: number
  overdue: number
  dueInPeriod: number
  blocked: number
  completed: number
  estimateOpen: number
  logged: number
  capacity: number
  load: number
  planned: number
}

/**
 * Holidays (not optional ones) and each member's approved leave in the range, for capacity.
 * Muster may not be in use; a read failure is logged and counts as no time off.
 */
async function timeOff(ctx: Ctx, memberIds: string[], range: { from: string; to: string }): Promise<{ holidays: string[]; leave: Map<string, LeaveSpan[]> }> {
  try {
    const [holidays, employees] = await Promise.all([
      ctx.db(Holiday).find({ date: { $gte: range.from, $lte: range.to }, isOptional: { $ne: true } }, { date: 1 }).lean(),
      ctx.db(Employee).find({ memberId: { $in: memberIds.map((id) => oid(id)) } }, { memberId: 1 }).lean(),
    ])
    const memberOf = new Map(employees.map((e) => [String(e._id), String(e.memberId)]))
    const requests = employees.length
      ? await ctx.db(LeaveRequest).find({ employeeId: { $in: employees.map((e) => e._id) }, status: 'approved', endDate: { $gte: range.from }, startDate: { $lte: range.to } }, { employeeId: 1, dates: 1, isHalfDay: 1 }).lean()
      : []
    const leave = new Map<string, LeaveSpan[]>()
    for (const r of requests) {
      const member = memberOf.get(String(r.employeeId))
      if (member) leave.set(member, [...(leave.get(member) ?? []), { dates: r.dates ?? [], isHalfDay: r.isHalfDay }])
    }
    return { holidays: holidays.map((h) => h.date), leave }
  } catch (error) {
    console.error('[work] could not read holidays or leave for workload', error)
    return { holidays: [], leave: new Map() }
  }
}

/** Per-member workload for a period (open tasks are a snapshot; completed and logged are in range). */
export async function teamWorkload(ctx: Ctx, memberIds: string[], range: { from: string; to: string }, today: string): Promise<WorkloadRow[]> {
  if (!memberIds.length) return []
  const workWeek = ctx.org.workWeek?.length ? ctx.org.workWeek : [1, 2, 3, 4, 5, 6]
  const start = new Date(`${range.from}T00:00:00+05:30`)
  const end = new Date(`${range.to}T23:59:59.999+05:30`)
  const [open, done, logged, people, off] = await Promise.all([
    ctx.db(Task).find({ assigneeIds: { $in: memberIds }, status: { $ne: 'done' }, isPersonal: { $ne: true } }, { assigneeIds: 1, status: 1, dueDate: 1, estimateMinutes: 1 }).lean(),
    ctx.db(Task).find({ assigneeIds: { $in: memberIds }, status: 'done', completedAt: { $gte: start, $lte: end }, isPersonal: { $ne: true } }, { assigneeIds: 1 }).lean(),
    ctx.db(TimeEntry).aggregate<{ _id: unknown; minutes: number }>([
      { $match: { memberId: { $in: memberIds.map((id) => oid(id)) }, date: { $gte: range.from, $lte: range.to } } },
      { $group: { _id: '$memberId', minutes: { $sum: '$minutes' } } },
    ]),
    peopleMap(ctx, memberIds),
    timeOff(ctx, memberIds, range),
  ])
  const tasks: WorkloadTask[] = open.map((t) => ({ assigneeIds: t.assigneeIds.map(String), status: t.status, dueDate: t.dueDate, estimateMinutes: t.estimateMinutes }))
  return memberIds.map((id) => {
    // Working days less holidays and this person's approved leave.
    const capacity = memberCapacityMinutes(range, workWeek, off.holidays, off.leave.get(id) ?? [])
    const stats = openTaskStats(id, tasks, today, range)
    const minutes = logged.find((l) => String(l._id) === id)?.minutes ?? 0
    return {
      id,
      name: people.get(id)?.name ?? 'Former member',
      ...stats,
      completed: done.filter((t) => t.assigneeIds.some((a) => String(a) === id)).length,
      logged: minutes,
      capacity,
      load: loadPercent(minutes, capacity),
      planned: loadPercent(stats.estimateDue, capacity),
    }
  })
}
