import 'server-only'
import type { Types } from 'mongoose'
import { daysBetween, formatDate, formatTime, todayIST } from '@/lib/dates'
import { userIdsWithPermission } from '@/lib/notify'
import { Member } from '@/models/Member'
import { User } from '@/models/User'
import { Employee } from '@/models/muster/Employee'
import { LeaveRequest } from '@/models/muster/LeaveRequest'
import { Meeting } from '@/models/work/Meeting'
import { Project } from '@/models/work/Project'
import { Task } from '@/models/work/Task'
import { currentStage } from '@/modules/muster/leave/approvals'
import { instantRange, isoRange, SCAN_LIMIT, type OrgScope, type Source } from './common'

/** Work and Muster records for the team recipes: late tasks, waiting approvals, meetings about to start. */

const HOUR_MS = 3_600_000

async function userIdsOf(scope: OrgScope, memberIds: readonly (Types.ObjectId | null | undefined)[]): Promise<Map<string, { userId: string; name: string }>> {
  const ids = memberIds.filter((id): id is Types.ObjectId => Boolean(id))
  if (!ids.length) return new Map()
  const members = await Member.find({ orgId: scope.orgId, _id: { $in: ids }, status: 'active' }, { userId: 1 }).lean()
  const users = await User.find({ _id: { $in: members.map((m) => m.userId) } }, { name: 1 }).lean()
  const names = new Map(users.map((u) => [String(u._id), u.name]))
  return new Map(members.map((m) => [String(m._id), { userId: String(m.userId), name: names.get(String(m.userId)) ?? '' }]))
}

export const taskDue: Source = async (scope, { window }) => {
  const range = isoRange(window)
  if (!range) return []
  const tasks = await scope.db(Task).find({ status: { $ne: 'done' }, dueDate: range }, { title: 1, dueDate: 1, assigneeIds: 1, projectId: 1 }).limit(SCAN_LIMIT).lean()
  const projects = await scope.db(Project).find({ _id: { $in: tasks.map((t) => t.projectId).filter(Boolean) } }, { name: 1, leadId: 1 }).lean()
  const byProject = new Map(projects.map((p) => [String(p._id), p]))
  const people = await userIdsOf(scope, [...tasks.flatMap((t) => t.assigneeIds ?? []), ...projects.map((p) => p.leadId)])
  const today = todayIST()
  return tasks.flatMap((t) => {
    const project = t.projectId ? byProject.get(String(t.projectId)) : undefined
    const lead = project ? people.get(String(project.leadId)) : undefined
    if (!lead || !t.dueDate) return []
    return [
      {
        entity: 'Task',
        entityId: String(t._id),
        vars: { task_title: t.title, days_late: daysBetween(t.dueDate, today), assignee_name: (t.assigneeIds ?? []).map((id) => people.get(String(id))?.name).filter(Boolean).join(', ') || 'no one', project_name: project?.name ?? '' },
        refs: { users: { manager: [lead.userId] }, href: `/app/work/tasks/${t._id}` },
      },
    ]
  })
}

/** When the request reached its current stage: the last stage decision, else when it was raised. */
export function stageStartedAt(r: { createdAt?: Date; decisions?: readonly { decidedAt?: Date | null }[] }): Date | undefined {
  const last = (r.decisions ?? []).map((d) => d.decidedAt).filter((d): d is Date => Boolean(d)).sort((a, b) => +b - +a)[0]
  return last ?? r.createdAt
}

/**
 * Leave requests waiting on their current stage longer than the rule's hours: the current approver (HR when the
 * manager has no login), and management for escalation. Timed from the last stage change, so HR is not chased
 * an hour after a manager passes a request on.
 */
export const approvalRequested: Source = async (scope, { window, now }) => {
  const range = instantRange(window)
  if (!range) return []
  const requests = await scope.db(LeaveRequest).find({ status: 'pending', updatedAt: range }).limit(SCAN_LIMIT).lean()
  if (!requests.length) return []
  const employees = await scope.db(Employee).find({ _id: { $in: [...requests.map((r) => r.employeeId), ...requests.map((r) => r.managerId).filter(Boolean)] } }, { fullName: 1, memberId: 1 }).lean()
  const byId = new Map(employees.map((e) => [String(e._id), e]))
  const people = await userIdsOf(scope, employees.map((e) => e.memberId))
  const [hr, everyone, escalation] = await Promise.all([userIdsWithPermission(scope.orgId, 'leave.approve'), userIdsWithPermission(scope.orgId, 'people.read_all'), userIdsWithPermission(scope.orgId, 'approvals.escalated')])
  const all = new Set(everyone.map(String))
  const hrSigners = hr.map(String).filter((id) => all.has(id))
  return requests.map((r) => {
    const stage = currentStage(r.stages ?? [], r.completedStages ?? [])
    const manager = stage === 'manager' && r.managerId ? people.get(String(byId.get(String(r.managerId))?.memberId)) : undefined
    const approver = manager ? [manager.userId] : stage === 'management' ? escalation.map(String) : hrSigners
    const created = stageStartedAt(r as { createdAt?: Date; updatedAt?: Date; decisions?: { decidedAt?: Date | null }[] }) ?? now
    const span = r.startDate === r.endDate ? formatDate(r.startDate) : `${formatDate(r.startDate, { short: true })} – ${formatDate(r.endDate)}`
    return {
      entity: 'LeaveRequest',
      entityId: String(r._id),
      vars: { employee_name: byId.get(String(r.employeeId))?.fullName ?? 'Someone', request_summary: `${r.leaveName}, ${span}`, hours_pending: Math.floor((now.getTime() - created.getTime()) / HOUR_MS) },
      refs: { users: { approver, escalation: escalation.map(String) }, href: '/app/hr/leave' },
    }
  })
}

export const meetingStart: Source = async (scope, { window }) => {
  const range = instantRange(window)
  if (!range) return []
  const meetings = await scope.db(Meeting).find({ status: 'scheduled', startAt: range }, { title: 1, startAt: 1, organizerId: 1, attendees: 1 }).limit(SCAN_LIMIT).lean()
  const people = await userIdsOf(scope, meetings.flatMap((m) => [m.organizerId, ...(m.attendees ?? []).map((a) => a.memberId)]))
  return meetings.map((m) => {
    const users = [...new Set([m.organizerId, ...(m.attendees ?? []).map((a) => a.memberId)].map((id) => people.get(String(id))?.userId).filter((id): id is string => Boolean(id)))]
    return {
      entity: 'Meeting',
      entityId: String(m._id),
      occurrence: m.startAt.toISOString(),
      vars: { meeting_title: m.title, meeting_time: formatTime(m.startAt) },
      refs: { users: { attendees: users }, href: `/app/work/meetings/${m._id}` },
    }
  })
}
