import { createHash, randomBytes } from 'node:crypto'
import { resolvePermissions } from '@/lib/permissions'
import type { SeedCtx, SeedMember } from '@/lib/seed-types'
import { AuditLog } from '@/models/AuditLog'
import { Invite } from '@/models/Invite'
import { Notification } from '@/models/Notification'
import { Message } from '@/models/messaging/Message'
import { Role } from '@/models/Role'
import { PayrollCycle } from '@/models/muster/PayrollCycle'
import { LeaveRequest } from '@/models/muster/LeaveRequest'
import { Deal } from '@/models/orbit/Deal'
import { Lead } from '@/models/orbit/Lead'
import { Invoice } from '@/models/folio/Invoice'
import { Project } from '@/models/work/Project'
import { Task } from '@/models/work/Task'

/**
 * Settings-area demo data (platform spec 14): a custom role, pending invites,
 * an audit trail, notifications for every demo login and a few outbox rows.
 * Models only; timestamps are spread over the last few weeks.
 */

const HOUR_MS = 3_600_000
const ago = (hours: number) => new Date(Date.now() - hours * HOUR_MS)
const hashToken = () => createHash('sha256').update(randomBytes(32)).digest('hex')

const COORDINATOR_PERMISSIONS = ['tasks.read', 'tasks.write', 'tasks.manage', 'projects.read', 'projects.write', 'spaces.manage', 'clients.read', 'work.reports']

type Note = { title: string; body?: string; href: string; kind: string; product?: string; event: string }
type Audit = { actor: SeedMember; action: string; entity: string; entityId?: unknown; summary: string; product?: string; meta?: Record<string, unknown>; platform?: boolean }

async function loadRefs(ctx: SeedCtx) {
  const [tasks, projects, invoices, leads, deals, cycle, leaves] = await Promise.all([
    ctx.db(Task).find({ isPersonal: { $ne: true } }, { title: 1, key: 1, assigneeIds: 1 }).sort({ createdAt: 1 }).limit(8).lean(),
    ctx.db(Project).find({}, { name: 1, leadId: 1, memberIds: 1 }).limit(3).lean(),
    ctx.db(Invoice).find({ status: { $ne: 'draft' } }, { number: 1, totalPaise: 1 }).sort({ issueDate: -1 }).limit(4).lean(),
    ctx.db(Lead).find({}, { companyName: 1 }).sort({ createdAt: -1 }).limit(4).lean(),
    ctx.db(Deal).find({}, { title: 1 }).limit(3).lean(),
    ctx.db(PayrollCycle).findOne({ status: 'payslips_published' }, { month: 1, year: 1 }).lean(),
    ctx.db(LeaveRequest).find({}, { leaveName: 1, raisedByName: 1 }).limit(3).lean(),
  ])
  return { tasks, projects, invoices, leads, deals, cycle, leaves }
}
type Refs = Awaited<ReturnType<typeof loadRefs>>

const at = <T>(list: T[], i: number): T | undefined => (list.length ? list[i % list.length] : undefined)

type ProjectRef = { _id: unknown; name: string; leadId?: unknown; memberIds?: readonly unknown[] | null }

/**
 * "You were added to <project>" only for the project's lead and members: anyone
 * else would get a bell link that opens a 404 (V2-CHECK: dead links).
 */
export function projectNotes(projects: readonly ProjectRef[], memberId: string): Note[] {
  return projects
    .filter((p) => String(p.leadId) === memberId || (p.memberIds ?? []).some((id) => String(id) === memberId))
    .map((p) => ({ title: `You were added to ${p.name}`, href: `/app/work/projects/${String(p._id)}`, kind: 'info', product: 'work', event: 'project.member_added' }))
}

/**
 * Drops payroll-month links for a role without payroll.read (HR executive since
 * D3), so the bell never links to a page that answers /app/denied.
 */
export function notesRoleCanOpen<T extends Pick<Note, 'href'>>(role: string, notes: readonly T[]): T[] {
  const mayOpenPayroll = resolvePermissions(role).has('payroll.read')
  return notes.filter((n) => mayOpenPayroll || !n.href.startsWith('/app/hr/payroll'))
}

/** Notifications every login sees, plus ones that depend on what the role does. */
function notesFor(role: string, memberId: string, refs: Refs, people: { mentioner: string; joiner: string }): Note[] {
  const task = (i: number) => at(refs.tasks, i)
  const common: Note[] = [
    ...[0, 1, 2, 3].flatMap((i) => (task(i) ? [{ title: `You were assigned ${task(i)!.key}`, body: task(i)!.title, href: `/app/work/tasks/${task(i)!._id}`, kind: 'assignment', product: 'work', event: 'task.assigned' }] : [])),
    ...[4, 5].flatMap((i) => (task(i) ? [{ title: `${people.mentioner} mentioned you in a comment`, body: task(i)!.title, href: `/app/work/tasks/${task(i)!._id}`, kind: 'mention', product: 'work', event: 'task.mentioned' }] : [])),
    { title: 'Announcement: Diwali office closure', body: 'The office is closed from 20 to 22 October.', href: '/app/work/posts', kind: 'info', product: 'work', event: 'post.announcement' },
    { title: 'Weekly sync moved to Thursday 11:00', href: '/app/work/meetings', kind: 'reminder', product: 'work', event: 'meeting.updated' },
    { title: 'Your September payslip is ready', href: '/app/me/payslips', kind: 'success', product: 'muster', event: 'payroll.payslip_published' },
    { title: 'Your casual leave for 3 Oct was approved', href: '/app/me/leave', kind: 'success', product: 'muster', event: 'leave.approved' },
    { title: 'Reminder: submit this week’s timesheet', href: '/app/work/time', kind: 'reminder', product: 'work', event: 'timesheet.reminder' },
    ...projectNotes(refs.projects, memberId),
  ]
  const hr: Note[] = [
    ...refs.leaves.map((l) => ({ title: `${l.raisedByName ?? 'Someone'} requested ${l.leaveName ?? 'leave'}`, href: '/app/hr/leave', kind: 'approval', product: 'muster', event: 'leave.requested' })),
    { title: 'Attendance correction waiting for review', href: '/app/hr/attendance/corrections', kind: 'approval', product: 'muster', event: 'attendance.correction_requested' },
    { title: 'New expense claim submitted', href: '/app/hr/claims', kind: 'approval', product: 'muster', event: 'claim.submitted' },
    ...(refs.cycle ? [{ title: 'September payroll released', href: `/app/hr/payroll/${refs.cycle._id}`, kind: 'success', product: 'muster', event: 'payroll.released' }] : []),
  ]
  const finance: Note[] = refs.invoices.map((inv, i) => (i % 2 === 0
    ? { title: `Payment received for ${inv.number}`, href: `/app/folio/invoices/${inv._id}`, kind: 'success', product: 'folio', event: 'invoice.paid' }
    : { title: `${inv.number} is overdue`, href: `/app/folio/invoices/${inv._id}`, kind: 'warning', product: 'folio', event: 'invoice.overdue' }))
  const sales: Note[] = [
    ...refs.leads.map((l) => ({ title: `New lead assigned: ${l.companyName}`, href: `/app/orbit/leads/${l._id}`, kind: 'assignment', product: 'orbit', event: 'orbit.lead_assigned' })),
    ...refs.deals.map((d) => ({ title: `Follow-up due on ${d.title}`, href: `/app/orbit/deals/${d._id}`, kind: 'reminder', product: 'orbit', event: 'orbit.followup_due' })),
  ]
  const workspace: Note[] = [
    { title: 'Subscription renewed: Suite, 25 seats', href: '/app/settings/subscription', kind: 'success', event: 'subscription.activated' },
    { title: `${people.joiner} joined the workspace`, href: '/app/settings/members', kind: 'info', event: 'member.joined' },
  ]
  const byRole: Record<string, Note[]> = {
    owner: [...hr, ...finance, ...sales, ...workspace],
    admin: [...hr, ...finance, ...workspace],
    hr_admin: hr,
    hr_exec: hr,
    finance: [...finance, hr[hr.length - 1]].filter(Boolean),
    manager: [...hr.slice(0, 2), ...sales.slice(0, 2), { title: 'Timesheet submitted for approval', href: '/app/work/time/approvals', kind: 'approval', product: 'work', event: 'timesheet.submitted' }],
    sales,
  }
  return notesRoleCanOpen(role, [...common, ...(byRole[role] ?? [])])
}

function auditRows(ctx: SeedCtx, refs: Refs): Audit[] {
  const m = ctx.members
  const rows: Audit[] = [
    { actor: m.owner, action: 'org.updated', entity: 'Org', entityId: ctx.orgId, summary: 'Updated the workspace address and GSTIN', meta: { after: { state: 'MP' } } },
    { actor: m.owner, action: 'subscription.activated', entity: 'Org', entityId: ctx.orgId, summary: 'Suite, monthly activated for 25 seats' },
    { actor: m.owner, action: 'role.created', entity: 'Role', summary: 'Created the role Project coordinator' },
    { actor: m.admin, action: 'role.updated', entity: 'Role', summary: 'Gave BD executive access to Orbit reports' },
    { actor: m.admin, action: 'member.invited', entity: 'Member', summary: 'Invited kunal.mehta@flowbit.test as Member' },
    { actor: m.admin, action: 'member.role_changed', entity: 'Member', entityId: m.manager._id, summary: 'Changed a member’s role from Member to Manager', meta: { before: { role: 'member' }, after: { role: 'manager' } } },
    { actor: m.owner, action: 'member.disabled', entity: 'Member', summary: 'Disabled a member who left the company', meta: { reason: 'Exited on 31 Aug' } },
    { actor: m.admin, action: 'org.modules_updated', entity: 'Org', entityId: ctx.orgId, summary: 'Switched on Whiteboards and Meetings' },
    { actor: m.owner, action: 'member.invite_revoked', entity: 'Member', summary: 'Revoked the invite for a duplicate email' },
    { actor: m.owner, action: 'platform.plan_changed', entity: 'Org', entityId: ctx.orgId, summary: 'Flowbit support extended the trial by 3 days', platform: true },
    { actor: m.owner, action: 'platform.note_added', entity: 'Org', entityId: ctx.orgId, summary: 'Flowbit support added an account note', platform: true },
    ...refs.tasks.slice(0, 6).map((t, i) => ({ actor: i % 2 ? m.manager : m.member, action: i % 3 === 0 ? 'task.created' : 'task.status_changed', entity: 'Task', entityId: t._id, summary: `${i % 3 === 0 ? 'Created' : 'Moved'} ${t.key} ${t.title}`, product: 'work' })),
    ...refs.projects.map((p) => ({ actor: m.manager, action: 'project.updated', entity: 'Project', entityId: p._id, summary: `Updated the timeline of ${p.name}`, product: 'work' })),
    ...refs.invoices.map((inv) => ({ actor: m.finance, action: 'invoice.issued', entity: 'Invoice', entityId: inv._id, summary: `Issued ${inv.number}`, product: 'folio' })),
    ...refs.leads.map((l) => ({ actor: m.sales, action: 'lead.stage_changed', entity: 'Lead', entityId: l._id, summary: `Moved ${l.companyName} to Engaged`, product: 'orbit' })),
    ...refs.deals.map((d) => ({ actor: m.sales, action: 'deal.updated', entity: 'Deal', entityId: d._id, summary: `Updated the value of ${d.title}`, product: 'orbit' })),
    ...refs.leaves.map((l) => ({ actor: m.hr_admin, action: 'leave.approved', entity: 'LeaveRequest', entityId: l._id, summary: `Approved ${l.leaveName ?? 'leave'} for ${l.raisedByName ?? 'an employee'}`, product: 'muster' })),
    ...(refs.cycle ? [
      { actor: m.hr_admin, action: 'payroll.generated', entity: 'PayrollCycle', entityId: refs.cycle._id, summary: 'Generated September payroll', product: 'muster' },
      { actor: m.finance, action: 'payroll.released', entity: 'PayrollCycle', entityId: refs.cycle._id, summary: 'Released September payroll', product: 'muster' },
      { actor: m.hr_admin, action: 'payslip.published', entity: 'PayrollCycle', entityId: refs.cycle._id, summary: 'Published September payslips', product: 'muster' },
    ] : []),
    { actor: m.hr_exec, action: 'holiday.created', entity: 'Holiday', summary: 'Added Diwali (20 Oct) to the holiday calendar', product: 'muster' },
    { actor: m.hr_admin, action: 'salary.structure_updated', entity: 'SalaryStructure', summary: 'Revised a salary structure from 1 October', product: 'muster' },
  ]
  return rows
}

export async function seed(ctx: SeedCtx): Promise<void> {
  if (await ctx.db(AuditLog).exists({})) {
    ctx.log('settings: already seeded')
    return
  }
  const refs = await loadRefs(ctx)
  const roleOf = new Map(ctx.allMembers.map((mem) => [String(mem.userId), mem]))
  const nameOf = new Map(Object.values(ctx.users).map((u) => [String(u._id), u.name]))

  await ctx.db(Role).create({ key: 'project_coordinator', label: 'Project coordinator', description: 'Runs day-to-day project work without access to money or people data.', permissions: COORDINATOR_PERMISSIONS, builtIn: false })

  const owner = ctx.users.owner
  await Invite.insertMany([
    { orgId: ctx.orgId, email: 'kunal.mehta@flowbit.test', name: 'Kunal Mehta', title: 'UI designer', role: 'member', tokenHash: hashToken(), invitedBy: owner._id, expiresAt: new Date(Date.now() + 6 * 24 * HOUR_MS), sentAt: ago(20), sendCount: 1, createdAt: ago(20), updatedAt: ago(20) },
    { orgId: ctx.orgId, email: 'ishita.rao@flowbit.test', name: 'Ishita Rao', title: 'Accounts executive', role: 'finance', tokenHash: hashToken(), invitedBy: ctx.users.admin._id, expiresAt: ago(72), sentAt: ago(240), sendCount: 2, createdAt: ago(240), updatedAt: ago(96) },
  ], { timestamps: false })

  const audits = auditRows(ctx, refs).map((row, i) => {
    const createdAt = ago(6 + i * 17)
    const actorUser = row.actor.userId
    return {
      orgId: ctx.orgId, actorId: actorUser, actorMemberId: row.actor._id,
      actorName: row.platform ? 'Flowbit support' : nameOf.get(String(actorUser)), actorRole: row.platform ? 'platform' : row.actor.role,
      action: row.action, entity: row.entity, entityId: row.entityId ? String(row.entityId) : undefined, summary: row.summary,
      product: row.product, meta: row.meta, platform: Boolean(row.platform), ip: '103.21.58.14', createdAt, updatedAt: createdAt,
    }
  })
  await AuditLog.insertMany(audits, { timestamps: false })

  const people = { mentioner: ctx.users.manager.name, joiner: ctx.users.member.name }
  const notifications = ctx.allMembers.flatMap((mem) => notesFor(roleOf.get(String(mem.userId))?.role ?? 'member', String(mem._id), refs, people).map((note, i) => {
    const createdAt = ago(1 + i * 7)
    return { orgId: ctx.orgId, userId: mem.userId, ...note, readAt: i % 2 === 1 ? new Date(createdAt.getTime() + HOUR_MS) : undefined, createdAt, updatedAt: createdAt }
  }))
  await Notification.insertMany(notifications, { timestamps: false })

  const mail = (kind: string, to: string, subject: string, hours: number, extra: Record<string, unknown> = {}) => ({
    orgId: ctx.orgId,
    channel: 'email',
    to: [to],
    subject,
    html: `<p>${subject}</p>`,
    text: subject,
    kind,
    provider: 'outbox',
    status: 'skipped',
    skipReason: 'no_provider',
    retry: false,
    timeline: [{ at: ago(hours), status: extra.status ?? 'skipped', note: extra.error ? String(extra.error) : 'Saved, not sent' }],
    createdAt: ago(hours),
    updatedAt: ago(hours),
    ...extra,
  })
  await Message.insertMany([
    mail('invite', 'kunal.mehta@flowbit.test', 'You are invited to Vistaar WebX on Flowbit', 20),
    mail('invite', 'ishita.rao@flowbit.test', 'You are invited to Vistaar WebX on Flowbit', 96),
    mail('subscription_invoice', owner.email, 'Your Flowbit invoice for this month', 10),
    mail('reminder', 'accounts@example.in', 'Payment reminder for your invoice', 30, { provider: 'resend', status: 'failed', skipReason: undefined, attempts: 5, error: 'Recipient mailbox is full (552).' }),
  ], { timestamps: false })

  ctx.log(`settings: 1 custom role, 2 invites, ${audits.length} audit entries, ${notifications.length} notifications, 4 messages`)
}
