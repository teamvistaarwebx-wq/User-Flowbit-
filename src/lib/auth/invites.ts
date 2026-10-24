import 'server-only'
import type { Types } from 'mongoose'
import type { Ctx } from '@/lib/ctx'
import { audit } from '@/lib/audit'
import { appUrl, isResendConfigured } from '@/lib/env'
import { emailLayout, sendMail } from '@/lib/mail'
import { notify } from '@/lib/notify'
import { roleLabel } from '@/lib/permissions'
import { UserError } from '@/lib/errors'
import { AttendanceDay } from '@/models/AttendanceDay'
import { Invite } from '@/models/Invite'
import { Member } from '@/models/Member'
import { Employee } from '@/models/muster/Employee'
import { User } from '@/models/User'
import { hashToken, randomToken } from './tokens'

export const INVITE_DAYS = 7

type InviteCtx = Pick<Ctx, 'orgId' | 'userId' | 'user' | 'org'>

const nameFromEmail = (email: string) =>
  email
    .split('@')[0]
    .split(/[._-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ') || email

/**
 * Invites someone by email: links (or creates) their User, adds an 'invited'
 * Member (counts as a seat), stores a hashed token and emails /invite/<token>.
 * Returns the raw link as `link` only when no email provider is configured.
 */
export type InviteInput = {
  email: string
  role: string
  /** Display name for a brand-new account (defaults to one derived from the email). */
  name?: string
  title?: string
  /** Muster Employee to link to the Member when the invite is accepted. */
  employeeId?: Types.ObjectId | string
}

export async function createInvite(ctx: InviteCtx, input: InviteInput) {
  const email = input.email.trim().toLowerCase()
  let user = await User.findOne({ email }).lean()
  if (!user) user = (await User.create({ email, name: input.name?.trim() || nameFromEmail(email) })).toObject()

  const existing = await Member.findOne({ orgId: ctx.orgId, userId: user._id }).lean()
  if (existing?.status === 'active') throw new UserError(`${email} is already a member of this workspace.`)

  const member = existing
    ? await Member.findOneAndUpdate({ _id: existing._id }, { $set: { status: 'invited', role: input.role, title: input.title } }, { returnDocument: 'after' }).lean()
    : (await Member.create({ orgId: ctx.orgId, userId: user._id, role: input.role, status: 'invited', title: input.title })).toObject()

  const previous = await Invite.findOne({ orgId: ctx.orgId, email, acceptedAt: null }).sort({ createdAt: -1 }).lean()
  await Invite.updateMany({ orgId: ctx.orgId, email, acceptedAt: null, revokedAt: null }, { $set: { revokedAt: new Date() } })
  const token = randomToken()
  const invite = await Invite.create({
    orgId: ctx.orgId,
    email,
    name: input.name,
    title: input.title,
    role: input.role,
    employeeId: input.employeeId,
    tokenHash: hashToken(token),
    invitedBy: ctx.userId,
    memberId: member!._id,
    expiresAt: new Date(Date.now() + INVITE_DAYS * 86_400_000),
    sentAt: new Date(),
    sendCount: (previous?.sendCount ?? 0) + 1,
  })

  const mail = emailLayout({
    title: `${ctx.user.name} invited you to ${ctx.org.name} on Flowbit`,
    paragraphs: [
      `You have been invited to join the ${ctx.org.name} workspace as ${roleLabel(input.role)}.`,
      `The link works for ${INVITE_DAYS} days.`,
    ],
    cta: { label: 'Accept invite', href: `/invite/${token}` },
  })
  await sendMail({ to: email, subject: `Join ${ctx.org.name} on Flowbit`, ...mail, orgId: ctx.orgId, kind: 'invite', entity: 'Member', entityId: member!._id, secrets: [token] })
  await audit(ctx, { action: 'member.invited', entity: 'Member', entityId: member!._id, summary: `Invited ${email} as ${roleLabel(input.role)}` })
  // Without an email provider the message only lands in the Outbox, so hand the link back for "Copy invite link".
  const link = isResendConfigured() ? null : appUrl(`/invite/${token}`)
  return { invite: invite.toObject(), member: member!, link }
}

/** Sends a fresh link for a pending invite. */
export async function resendInvite(ctx: InviteCtx, memberId: Types.ObjectId | string) {
  const member = await Member.findOne({ _id: memberId, orgId: ctx.orgId, status: 'invited' }).lean()
  if (!member) throw new UserError('That invite is no longer pending.')
  const user = await User.findById(member.userId).lean()
  if (!user) throw new UserError('That invite is no longer pending.')
  const last = await Invite.findOne({ orgId: ctx.orgId, memberId: member._id }).sort({ createdAt: -1 }).lean()
  return createInvite(ctx, { email: user.email, role: member.role, title: member.title ?? undefined, employeeId: last?.employeeId ?? undefined })
}

/** Looks up a pending, unexpired invite by its raw token. */
export async function findInvite(token: string) {
  const invite = await Invite.findOne({ tokenHash: hashToken(token), acceptedAt: null, revokedAt: null, expiresAt: { $gt: new Date() } }).lean()
  return invite
}

/**
 * The pending invite for `token`, refused (UserError) when it expired or is
 * meant for another address. Sign-in and sign-up call this before creating a
 * session, so a refused invite never leaves the visitor signed in.
 */
export async function inviteForEmail(token: string, email: string) {
  const invite = await findInvite(token)
  if (!invite) throw new UserError('This invite link has expired or was already used. Ask for a new one.')
  if (email !== invite.email) throw new UserError(`This invite is for ${invite.email}. Sign in with that email to accept it.`)
  return invite
}

/**
 * Links the Muster employee record named on the invite to the new member, both
 * ways (Employee.memberId and Member.employeeId), so self-service works and the
 * member's check-ins reach the register. An employee already linked to someone
 * else is left alone.
 */
async function linkEmployee(orgId: Types.ObjectId, employeeId: Types.ObjectId, memberId: Types.ObjectId): Promise<boolean> {
  const linked = await Employee.updateOne({ _id: employeeId, orgId, $or: [{ memberId: null }, { memberId }] }, { $set: { memberId } })
  if (!linked.matchedCount) return false
  await Member.updateOne({ _id: memberId, orgId }, { $set: { employeeId } })
  await AttendanceDay.updateMany({ orgId, memberId }, { $set: { employeeId } })
  return true
}

/**
 * An invite sent from Settings → Members names no employee: link the one whose work email is the new member's
 * sign-in email, when it has no login yet and the member has no record yet.
 */
async function linkEmployeeByEmail(orgId: Types.ObjectId, email: string, memberId: Types.ObjectId): Promise<boolean> {
  const member = await Member.findOne({ _id: memberId, orgId }, { employeeId: 1 }).lean()
  if (member?.employeeId) return false
  const employee = await Employee.findOne({ orgId, workEmailLower: email.toLowerCase(), deletedAt: null, memberId: null }, { _id: 1 }).lean()
  return employee ? linkEmployee(orgId, employee._id, memberId) : false
}

/**
 * What becomes of the member row an invite was made for when an account accepts it (pure, for tests). Normally the
 * row already belongs to that account ('keep'). When the placeholder account the invite created is gone (deleted
 * outside Flowbit) and sign-up made a new one, the row is taken over by the new account ('claim'), or, if that
 * account already has a row in the workspace, the stale invited row is dropped ('drop'). Never a second row.
 */
export function invitedRowAction(row: { userId: unknown; status: string } | null, acceptingUserId: unknown, rowUserExists: boolean, accountHasRow: boolean): 'keep' | 'claim' | 'drop' {
  if (!row || String(row.userId) === String(acceptingUserId) || rowUserExists) return 'keep'
  if (!accountHasRow) return 'claim'
  return row.status === 'invited' ? 'drop' : 'keep'
}

/** Puts the invite's own member row on the accepting account before it is activated, so no duplicate is made. */
async function claimInvitedRow(orgId: Types.ObjectId, memberId: Types.ObjectId | null | undefined, userId: Types.ObjectId) {
  if (!memberId) return
  const row = await Member.findOne({ _id: memberId, orgId }, { userId: 1, status: 1, employeeId: 1 }).lean()
  if (!row || String(row.userId) === String(userId)) return
  const [rowUser, accountRow] = await Promise.all([User.exists({ _id: row.userId }), Member.findOne({ orgId, userId }, { employeeId: 1 }).lean()])
  const step = invitedRowAction(row, userId, Boolean(rowUser), Boolean(accountRow))
  if (step === 'claim') {
    await Member.updateOne({ _id: row._id, orgId }, { $set: { userId } })
  } else if (step === 'drop' && accountRow) {
    // The account keeps its own row; an employee link on the stale row moves over when the account has none.
    if (row.employeeId && !accountRow.employeeId) {
      await Member.updateOne({ _id: accountRow._id, orgId }, { $set: { employeeId: row.employeeId } })
      await Employee.updateOne({ _id: row.employeeId, orgId, memberId: row._id }, { $set: { memberId: accountRow._id } })
    }
    await Member.deleteOne({ _id: row._id, orgId, status: 'invited' })
    await Invite.updateMany({ orgId, memberId: row._id }, { $set: { memberId: accountRow._id } })
  }
}

/** The condition that claims an invite: still unused, not revoked and not expired at `now`. */
export const inviteClaimFilter = (id: unknown, now: Date) => ({ _id: id, acceptedAt: null, revokedAt: null, expiresAt: { $gt: now } })

/** Joins the invite's workspace as `userId` and marks the invite used. */
export async function acceptInvite(token: string, userId: Types.ObjectId) {
  const user = await User.findById(userId).lean()
  if (!user) throw new UserError('Sign in again to accept this invite.')
  const invite = await inviteForEmail(token, user.email)
  // Claim the invite first, atomically: two accepts at once must not both write the member, audit row and notice.
  const claimed = await Invite.findOneAndUpdate(inviteClaimFilter(invite._id, new Date()), { $set: { acceptedAt: new Date() } }, { projection: { _id: 1 } }).lean()
  if (!claimed) throw new UserError('This invite has already been used. Sign in to open the workspace.')
  await claimInvitedRow(invite.orgId, invite.memberId, userId)
  await Member.updateOne(
    { orgId: invite.orgId, userId },
    { $set: { status: 'active', role: invite.role, joinedAt: new Date(), ...(invite.title ? { title: invite.title } : {}) } },
    { upsert: true },
  )
  const member = await Member.findOne({ orgId: invite.orgId, userId }, { _id: 1 }).lean()
  if (member) {
    const linked = invite.employeeId ? await linkEmployee(invite.orgId, invite.employeeId, member._id) : false
    if (!linked) await linkEmployeeByEmail(invite.orgId, user.email, member._id)
  }
  await audit(
    { orgId: invite.orgId, userId, user, memberId: member?._id, role: invite.role },
    { action: 'member.joined', entity: 'Member', entityId: member?._id, summary: `${user.name} joined as ${roleLabel(invite.role)}` },
  )
  if (invite.invitedBy) {
    await notify(
      { orgId: invite.orgId, userId },
      { userIds: [invite.invitedBy], title: `${user.name} joined the workspace`, href: '/app/settings/members', kind: 'success', event: 'member.joined' },
    )
  }
  return invite
}
