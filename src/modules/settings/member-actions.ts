'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { action, fail, ok } from '@/lib/actions'
import { audit } from '@/lib/audit'
import { createInvite, resendInvite } from '@/lib/auth/invites'
import type { Ctx } from '@/lib/ctx'
import { withTransaction } from '@/lib/db'
import { NotFoundError, UserError } from '@/lib/errors'
import { emailLayout, sendMail } from '@/lib/mail'
import { notify } from '@/lib/notify'
import { resolvePermissions } from '@/lib/permissions'
import { objectId, optionalText } from '@/lib/validation'
import { Invite } from '@/models/Invite'
import { Member } from '@/models/Member'
import { Employee } from '@/models/muster/Employee'
import { Session } from '@/models/Session'
import { User } from '@/models/User'
import { assertCapacity } from '@/modules/subscription/usage'
import { assertCanGrant, customRolesOf, describeRole } from './role-access'
import { wouldLoop } from './roles'

const OPTS = { perm: 'members.manage' } as const
/** Freeing seats stays possible while read-only, so an ended trial can trim to 5 people and return to Free (console spec 2). */
const TRIM_OPTS = { ...OPTS, allowReadOnly: true } as const
const MAX_INVITES = 20
const RESEND_WAIT_MS = 60_000
const emailRule = z.string().email()

const refresh = () => revalidatePath('/app/settings/members')

async function loadMember(ctx: Ctx, memberId: string) {
  const member = await ctx.db(Member).findById(memberId).lean()
  if (!member) throw new NotFoundError('That member')
  const user = await User.findById(member.userId, { name: 1, email: 1 }).lean()
  return { member, name: user?.name ?? 'This member', email: user?.email ?? '' }
}

function parseEmails(raw: string): string[] {
  return [...new Set(raw.split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean))]
}

type InviteLink = { email: string; url: string }

const inviteSchema = z.object({
  emails: z.string({ error: 'Add at least one email' }).max(4000),
  role: z.string().min(1, 'Choose a role'),
  title: optionalText(60),
  employeeId: objectId.optional(),
})

/** Invites 1–20 people with one role; each gets an emailed link valid 7 days (returned as `links` when no email provider is set up). */
export const inviteMembers = action<typeof inviteSchema, { links: InviteLink[] }>(
  inviteSchema,
  async (input, ctx) => {
    const emails = parseEmails(input.emails)
    if (!emails.length) return fail('Add at least one email.', { emails: 'Add at least one email' })
    if (emails.length > MAX_INVITES) return fail(`Invite at most ${MAX_INVITES} people at a time.`, { emails: `At most ${MAX_INVITES} addresses` })
    const bad = emails.find((e) => !emailRule.safeParse(e).success)
    if (bad) return fail(`${bad} isn't a valid email.`, { emails: `${bad} isn't a valid email` })
    if (input.employeeId && emails.length > 1) return fail('Link an employee record to one person at a time.', { employeeId: 'Invite one person when linking a record' })
    if (input.employeeId) {
      // Linking hands over that record's self-service (pay, bank, documents): same rule as Muster's link action.
      if (!ctx.can('people.write')) return fail('Linking an employee record needs permission to edit people in Muster.', { employeeId: 'Needs people access' })
      const employee = await ctx.db(Employee).findById(input.employeeId, { workEmailLower: 1 }).lean()
      if (!employee) throw new NotFoundError('That employee')
      if (String(input.employeeId) === String(ctx.member.employeeId ?? '') && !ctx.can('roles.manage')) return fail('This is about your own record, so someone else has to make this decision.')
      if (!ctx.can('people.read_sensitive') && employee.workEmailLower !== emails[0]) return fail('Invite the employee at their work email to link their record.', { emails: 'Use their work email' })
    }
    const role = describeRole(input.role, await customRolesOf(ctx))
    assertCanGrant(ctx, role.permissions, { role: input.role })

    const users = await User.find({ email: { $in: emails } }, { email: 1 }).lean()
    const existing = await ctx.db(Member).find({ userId: { $in: users.map((u) => u._id) } }, { userId: 1, status: 1 }).lean()
    const statusOf = (email: string) => {
      const user = users.find((u) => u.email === email)
      return user ? existing.find((m) => String(m.userId) === String(user._id))?.status : undefined
    }
    for (const email of emails) {
      if (statusOf(email) === 'active') return fail(`${email} is already a member.`, { emails: `${email} is already a member` })
      if (statusOf(email) === 'disabled') return fail(`${email} was disabled. Enable them instead.`, { emails: `${email} was disabled` })
    }
    // Each new invite replaces any pending one to the same email (createInvite revokes it), possibly with another role.
    await assertCapacity(ctx, { addLogins: emails.length, addRoles: emails.map(() => role.key), excludeInviteEmails: emails })

    const links: InviteLink[] = []
    for (const email of emails) {
      const { link } = await createInvite(ctx, { email, role: role.key, title: input.title, employeeId: input.employeeId })
      if (link) links.push({ email, url: link })
    }
    refresh()
    if (links.length) return ok(links.length === 1 ? `Invitation saved for ${emails[0]}. Copy the link and send it to them.` : `Invitations saved for ${links.length} people. Copy each link and send it on.`, { links })
    return ok(emails.length === 1 ? `Invitation sent to ${emails[0]}.` : `Invitations sent to ${emails.length} people.`)
  },
  OPTS,
)

/** Sends a fresh link (new token, 7 more days). */
export const resendInvitation = action(
  z.object({ memberId: objectId }),
  async ({ memberId }, ctx) => {
    const { member, email } = await loadMember(ctx, memberId)
    if (member.status !== 'invited') return fail('That invitation is no longer pending.')
    assertCanGrant(ctx, [...resolvePermissions(member.role, await customRolesOf(ctx))], { role: member.role })
    const last = await ctx.db(Invite).findOne({ memberId: member._id }).sort({ createdAt: -1 }).lean()
    if (last?.sentAt && Date.now() - new Date(last.sentAt).getTime() < RESEND_WAIT_MS) return fail('Invitation just sent. Try again in a minute.')
    const expired = !last || last.revokedAt || new Date(last.expiresAt) <= new Date()
    if (expired) await assertCapacity(ctx, { addLogins: 1, addRoles: [member.role] })
    await resendInvite(ctx, member._id)
    refresh()
    return ok(`Invitation sent again to ${email}.`)
  },
  OPTS,
)

/** Revokes a pending invitation: the link stops working and the seat is freed. */
export const revokeInvitation = action(
  z.object({ memberId: objectId }),
  async ({ memberId }, ctx) => {
    const { member, email } = await loadMember(ctx, memberId)
    if (member.status !== 'invited') return fail('That invitation is no longer pending.')
    await ctx.db(Invite).updateMany({ memberId: member._id, acceptedAt: null, revokedAt: null }, { $set: { revokedAt: new Date() } })
    const joinedBefore = await ctx.db(Invite).exists({ memberId: member._id, acceptedAt: { $ne: null } })
    if (joinedBefore) await ctx.db(Member).updateOne({ _id: member._id }, { $set: { status: 'disabled' } })
    else await ctx.db(Member).deleteOne({ _id: member._id, status: 'invited' })
    await audit(ctx, { action: 'member.invite_revoked', entity: 'Member', entityId: member._id, summary: `Revoked the invitation for ${email}` })
    refresh()
    return ok(`Invitation for ${email} revoked.`)
  },
  TRIM_OPTS,
)

/** Changes a member's role; it applies on their next request. */
export const changeMemberRole = action(
  z.object({ memberId: objectId, role: z.string().min(1, 'Choose a role') }),
  async (input, ctx) => {
    const { member, name } = await loadMember(ctx, input.memberId)
    if (String(member._id) === String(ctx.memberId)) return fail("You can't change your own role.")
    if (member.role === 'owner') return fail('The owner keeps every permission. Use Transfer ownership to hand it over.')
    if (member.role === input.role) return fail(`${name} already has that role.`)
    // Accepting the invite would restore the invited role; change it by inviting again.
    if (member.status === 'invited') return fail(`${name} hasn't joined yet. Revoke the invitation and invite them again with the new role.`)
    const customRoles = await customRolesOf(ctx)
    const next = describeRole(input.role, customRoles)
    const current = describeRole(member.role, customRoles)
    assertCanGrant(ctx, next.permissions, { role: input.role })
    assertCanGrant(ctx, current.permissions)
    if (member.status === 'active') await assertCapacity(ctx, { roleOverrides: [{ memberId: String(member._id), role: next.key }] })
    await ctx.db(Member).updateOne({ _id: member._id }, { $set: { role: next.key } })
    await audit(ctx, { action: 'member.role_changed', entity: 'Member', entityId: member._id, summary: `${name} is now ${next.label} (was ${current.label})`, meta: { from: current.label, to: next.label } })
    await notify(ctx, { userIds: [member.userId], title: `Your role in ${ctx.org.name} is now ${next.label}`, href: '/app/settings/profile', kind: 'info', event: 'member.role_changed' })
    refresh()
    return ok(`${name} is now ${next.label}. It applies on their next request.`)
  },
  OPTS,
)

/** Disable signs the person out of this workspace now; enable needs a free seat. */
export const setMemberStatus = action(
  z.object({ memberId: objectId, status: z.enum(['active', 'disabled']) }),
  async (input, ctx) => {
    if (input.status === 'active') ctx.assertWritable()
    const { member, name } = await loadMember(ctx, input.memberId)
    if (member.status === 'invited') return fail('That person has not joined yet. Revoke the invitation instead.')
    if (member.status === input.status) return fail(input.status === 'active' ? `${name} can already sign in.` : `${name} is already disabled.`)
    // Enabling restores the member's role and disabling removes it: either way only for roles the actor could grant.
    if (member.role !== 'owner') assertCanGrant(ctx, [...resolvePermissions(member.role, await customRolesOf(ctx))])
    if (input.status === 'disabled') {
      if (String(member._id) === String(ctx.memberId)) return fail("You can't disable yourself.")
      if (member.role === 'owner') return fail("The owner can't be disabled. Transfer ownership first.")
      await ctx.db(Member).updateOne({ _id: member._id }, { $set: { status: 'disabled' } })
      await Session.updateMany({ userId: member.userId, activeOrgId: ctx.orgId }, { $unset: { activeOrgId: 1 } })
      await audit(ctx, { action: 'member.disabled', entity: 'Member', entityId: member._id, summary: `${name} was disabled` })
      refresh()
      return ok(`${name} disabled. 1 seat freed.`)
    }
    await assertCapacity(ctx, { addLogins: 1, addRoles: [member.role] }, `No seat free for ${name}. Add a seat or disable someone first.`)
    await ctx.db(Member).updateOne({ _id: member._id }, { $set: { status: 'active' } })
    await audit(ctx, { action: 'member.enabled', entity: 'Member', entityId: member._id, summary: `${name} can sign in again` })
    refresh()
    return ok(`${name} can sign in again.`)
  },
  TRIM_OPTS,
)

const detailsSchema = z.object({
  memberId: objectId,
  title: optionalText(60),
  department: optionalText(60),
  managerId: z.preprocess((v) => (v === 'none' ? undefined : v), objectId.optional()),
})

/** Title, department and manager (department and manager come from HR when linked to an employee). */
export const updateMemberDetails = action(
  detailsSchema,
  async (input, ctx) => {
    const { member, name } = await loadMember(ctx, input.memberId)
    const linked = Boolean(member.employeeId)
    if (input.managerId && !linked) {
      const all = await ctx.db(Member).find({ status: { $ne: 'invited' } }, { managerId: 1, userId: 1 }).lean()
      if (!all.some((m) => String(m._id) === input.managerId)) throw new UserError('Choose a manager from this workspace.', { managerId: 'Choose a member' })
      const managerOf = new Map(all.map((m) => [String(m._id), m.managerId ? String(m.managerId) : null]))
      if (wouldLoop(String(member._id), input.managerId, managerOf)) {
        const managerUser = await User.findById(all.find((m) => String(m._id) === input.managerId)?.userId, { name: 1 }).lean()
        throw new UserError(`That would make a loop: ${managerUser?.name ?? 'that person'} reports to ${name}.`, { managerId: 'That would make a loop' })
      }
    }
    const set: Record<string, unknown> = { title: input.title ?? null }
    if (!linked) Object.assign(set, { department: input.department ?? null, managerId: input.managerId ?? null })
    const before = { title: member.title, department: member.department, managerId: member.managerId }
    await ctx.db(Member).updateOne({ _id: member._id }, { $set: set })
    await audit(ctx, { action: 'member.updated', entity: 'Member', entityId: member._id, summary: `Details saved for ${name}`, changes: { before, after: set } })
    refresh()
    return ok(`Details saved for ${name}.`)
  },
  OPTS,
)

/** Owner only: makes another active member the owner; the old owner becomes an admin. */
export const transferOwnership = action(
  z.object({ memberId: objectId, confirm: z.string() }),
  async (input, ctx) => {
    if (!ctx.isOwner) return fail('Only the owner can transfer ownership.')
    if (input.confirm.trim() !== ctx.org.name) return fail(`Type ${ctx.org.name} to confirm.`, { confirm: 'Type the workspace name' })
    const { member, name, email } = await loadMember(ctx, input.memberId)
    if (String(member._id) === String(ctx.memberId)) return fail('You already own this workspace.')
    if (member.status !== 'active') return fail('Choose someone who is active in the workspace.')
    // The new owner gets every permission, so they may take an Orbit or Folio seat.
    await assertCapacity(ctx, { roleOverrides: [{ memberId: String(member._id), role: 'owner' }, { memberId: String(ctx.memberId), role: 'admin' }] })
    await withTransaction(async (session) => {
      await ctx.db(Member).updateOne({ _id: member._id }, { $set: { role: 'owner' } }, { session })
      await ctx.db(Member).updateOne({ _id: ctx.memberId }, { $set: { role: 'admin' } }, { session })
    })
    await audit(ctx, { action: 'org.ownership_transferred', entity: 'Member', entityId: member._id, summary: `${ctx.user.name} transferred ownership of ${ctx.org.name} to ${name}` })
    await notify(ctx, { userIds: [member.userId, ctx.userId], includeSelf: true, title: `${name} now owns ${ctx.org.name}`, href: '/app/settings/members', kind: 'info', event: 'member.role_changed' })
    if (email) {
      const mail = emailLayout({ title: `You now own ${ctx.org.name} on Flowbit`, paragraphs: [`${ctx.user.name} transferred ownership of ${ctx.org.name} to you. You now manage the subscription and can delete the workspace.`], cta: { label: 'Open settings', href: '/app/settings' } })
      await sendMail({ to: email, subject: `You now own ${ctx.org.name}`, ...mail, orgId: ctx.orgId, kind: 'other', entity: 'Member', entityId: member._id })
    }
    revalidatePath('/app', 'layout')
    return ok(`${name} now owns ${ctx.org.name}. You're an admin.`)
  },
  OPTS,
)
