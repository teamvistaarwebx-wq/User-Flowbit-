'use server'

import { revalidatePath } from 'next/cache'
import { Types } from 'mongoose'
import { z } from 'zod'
import { action, fail, ok, publicAction } from '@/lib/actions'
import type { ActionResult } from '@/lib/action-types'
import { audit } from '@/lib/audit'
import { generateRecoveryCodes, hashRecoveryCode, verifyTotp } from '@/lib/console/totp'
import { encryptionKey } from '@/lib/env'
import { emailLayout, sendMail } from '@/lib/mail'
import { clearRateLimit } from '@/lib/rate-limit'
import { safeNextPath } from '@/lib/safe-next'
import { openSecret, sealSecret } from '@/lib/secret-box'
import { checkbox, objectId } from '@/lib/validation'
import { hasLiveWorkspace } from '@/lib/workspace'
import { Member } from '@/models/Member'
import { Org } from '@/models/Org'
import { User } from '@/models/User'
import { acceptInvite } from './invites'
import { createSession, setActiveOrg } from './session'
import { checkSecondFactor, clearPendingSignIn, readPendingSignIn, rememberDevice } from './two-factor'
import { resetRefusal, TWO_FACTOR_ADMIN_ROLES } from './two-factor-core'
import { noteWrongTwoFactorCode, twoFactorCodeLimit } from './two-factor-alert'
import { beginEnrolment } from '@/modules/settings/two-factor-view'
import type { TwoFactorEnrolment } from '@/components/settings/two-factor-card'

/**
 * Two-factor sign-in actions: the code after the password or Google, enrol
 * (QR on Settings → Security), turn off, new recovery codes, an admin's reset
 * of a member (audited) and the workspace's "Require 2FA for admins".
 */

const SELF = { allowReadOnly: true, allowBlocked: true, allowWithout2fa: true } as const
const NO_KEY = 'Two-factor sign-in needs APP_ENCRYPTION_KEY on the server. Ask the person who runs Flowbit to set it.'
const codeField = z.string().trim().min(6, 'Enter the 6-digit code').max(20)

const codeLimit = (userId: string) => twoFactorCodeLimit(userId)

// --- Sign-in ------------------------------------------------------------------------

export const verifyTwoFactorAction = publicAction(z.object({ code: codeField, remember: checkbox }), async ({ code, remember }) => {
  const pending = await readPendingSignIn()
  if (!pending) return fail('Your sign-in expired. Sign in again.', undefined)
  const refused = await codeLimit(pending.u)
  if (refused) return fail(refused)
  const checked = await checkSecondFactor(pending.u, code)
  if (!checked.ok) {
    await noteWrongTwoFactorCode(pending.u)
    return fail(checked.error, { code: 'Wrong code' })
  }
  await Promise.all([clearRateLimit(`twoFactorCode:${pending.u}`), clearRateLimit(`twoFactorDaily:${pending.u}`)])
  const user = await User.findById(pending.u, { name: 1, twoFactor: 1, lastOrgId: 1 }).lean()
  if (!user) return fail('Sign in again.')
  const userId = user._id
  await clearPendingSignIn()
  await createSession(userId, pending.o ? new Types.ObjectId(pending.o) : user.lastOrgId)
  if (remember) await rememberDevice(userId, user.twoFactor?.deviceEpoch ?? 0)
  const left = checked.recoveryLeft == null ? '' : ` You have ${checked.recoveryLeft} recovery ${checked.recoveryLeft === 1 ? 'code' : 'codes'} left.`
  if (pending.invite) {
    const invite = await acceptInvite(pending.invite, userId)
    await setActiveOrg(invite.orgId)
    return ok(`Welcome, ${user.name.split(' ')[0]}. You joined the workspace.${left}`, undefined, '/app')
  }
  const landing = (await hasLiveWorkspace(userId)) ? safeNextPath(pending.next, '/app') : '/onboarding'
  return ok(`Welcome back, ${user.name.split(' ')[0]}.${left}`, undefined, landing)
})

// --- Enrol, turn off, new recovery codes -----------------------------------------------

/** "Set up two-factor sign-in": makes (or resumes) the pending secret and returns its QR. Nothing is made before this click. */
export const startTwoFactorSetupAction = action(
  z.object({}),
  async (_input, ctx): Promise<ActionResult<TwoFactorEnrolment>> => {
    if (!encryptionKey()) return fail(NO_KEY)
    const enrolment = await beginEnrolment(ctx.userId)
    if (!enrolment) return fail('Two-factor sign-in is already on.')
    return ok('', enrolment)
  },
  SELF,
)

/** Confirms the first code from the authenticator app; the recovery codes come back once. */
export const confirmTwoFactorAction = action(
  z.object({ code: codeField }),
  async ({ code }, ctx): Promise<ActionResult<{ codes: string[] }>> => {
    const refused = await codeLimit(String(ctx.userId))
    if (refused) return fail(refused)
    const key = encryptionKey()
    if (!key) return fail(NO_KEY)
    const user = await User.findById(ctx.userId, { twoFactor: 1 }).lean()
    if (user?.twoFactor?.enabledAt) return fail('Two-factor sign-in is already on.')
    const secret = openSecret(user?.twoFactor?.pendingSealed, key)
    if (!secret) return fail('Press Set up again to get a new QR code.')
    const step = verifyTotp(secret, code)
    if (step == null) return fail('That code is not right. Scan the QR code again and enter the code your app shows now.', { code: 'Wrong code' })
    const codes = generateRecoveryCodes()
    await User.updateOne(
      { _id: ctx.userId },
      { $set: { 'twoFactor.secretSealed': sealSecret(secret, key), 'twoFactor.enabledAt': new Date(), 'twoFactor.lastStep': step, 'twoFactor.recoveryCodeHashes': codes.map(hashRecoveryCode) }, $unset: { 'twoFactor.pendingSealed': 1 } },
    )
    await audit(ctx, { action: 'user.two_factor_enabled', entity: 'User', entityId: ctx.userId, summary: `${ctx.user.name} turned on two-factor sign-in` })
    revalidatePath('/app', 'layout')
    return ok('Two-factor sign-in is on.', { codes })
  },
  SELF,
)

/** Admins of a workspace that requires 2FA cannot turn it off. */
async function requiredSomewhere(userId: Types.ObjectId): Promise<string | null> {
  const members = await Member.find({ userId, status: 'active', role: { $in: TWO_FACTOR_ADMIN_ROLES } }, { orgId: 1 }).lean()
  if (!members.length) return null
  const org = await Org.findOne({ _id: { $in: members.map((m) => m.orgId) }, 'security.requireTwoFactorAdmins': true, deletedAt: null }, { name: 1 }).lean()
  return org?.name ?? null
}

export const disableTwoFactorAction = action(
  z.object({ code: codeField }),
  async ({ code }, ctx) => {
    const required = await requiredSomewhere(ctx.userId)
    if (required) return fail(`${required} requires two-factor sign-in for owners and admins, so it stays on.`)
    const refused = await codeLimit(String(ctx.userId))
    if (refused) return fail(refused)
    const checked = await checkSecondFactor(ctx.userId, code)
    if (!checked.ok) {
      await noteWrongTwoFactorCode(String(ctx.userId))
      return fail(checked.error, { code: 'Wrong code' })
    }
    await User.updateOne({ _id: ctx.userId }, { $unset: { 'twoFactor.secretSealed': 1, 'twoFactor.enabledAt': 1, 'twoFactor.lastStep': 1, 'twoFactor.recoveryCodeHashes': 1 }, $inc: { 'twoFactor.deviceEpoch': 1 } })
    await audit(ctx, { action: 'user.two_factor_disabled', entity: 'User', entityId: ctx.userId, summary: `${ctx.user.name} turned off two-factor sign-in` })
    revalidatePath('/app', 'layout')
    return ok('Two-factor sign-in is off.')
  },
  SELF,
)

export const regenerateRecoveryCodesAction = action(
  z.object({ code: codeField }),
  async ({ code }, ctx): Promise<ActionResult<{ codes: string[] }>> => {
    const refused = await codeLimit(String(ctx.userId))
    if (refused) return fail(refused)
    const checked = await checkSecondFactor(ctx.userId, code)
    if (!checked.ok) {
      await noteWrongTwoFactorCode(String(ctx.userId))
      return fail(checked.error, { code: 'Wrong code' })
    }
    const codes = generateRecoveryCodes()
    await User.updateOne({ _id: ctx.userId, 'twoFactor.enabledAt': { $ne: null } }, { $set: { 'twoFactor.recoveryCodeHashes': codes.map(hashRecoveryCode) } })
    await audit(ctx, { action: 'user.recovery_codes_renewed', entity: 'User', entityId: ctx.userId, summary: `${ctx.user.name} made new recovery codes` })
    return ok('New recovery codes made. The old ones no longer work.', { codes })
  },
  SELF,
)

// --- Admin -------------------------------------------------------------------------

/** Turns a member's 2FA off (lost phone and codes); every remembered device is forgotten. Audited and emailed. */
export const resetMemberTwoFactor = action(
  z.object({ memberId: objectId }),
  async ({ memberId }, ctx) => {
    const member = await ctx.db(Member).findOne({ _id: memberId }).lean()
    if (!member) return fail('That member is not in this workspace.')
    const user = await User.findById(member.userId, { name: 1, email: 1, twoFactor: 1 }).lean()
    if (!user) return fail('That member is not in this workspace.')
    const otherWorkspaces = await Member.countDocuments({ userId: user._id, orgId: { $ne: ctx.orgId }, status: { $in: ['active', 'invited'] } })
    const refusal = resetRefusal({ actorIsOwner: ctx.isOwner, targetRole: member.role, isSelf: String(member._id) === String(ctx.memberId), enabled: Boolean(user.twoFactor?.enabledAt), otherWorkspaces })
    if (refusal) return fail(refusal)
    await User.updateOne({ _id: user._id }, { $unset: { 'twoFactor.secretSealed': 1, 'twoFactor.enabledAt': 1, 'twoFactor.lastStep': 1, 'twoFactor.recoveryCodeHashes': 1, 'twoFactor.pendingSealed': 1 }, $inc: { 'twoFactor.deviceEpoch': 1 } })
    await audit(ctx, { action: 'member.two_factor_reset', entity: 'Member', entityId: member._id, summary: `${ctx.user.name} reset two-factor sign-in for ${user.name}` })
    const mail = emailLayout({
      title: 'Your two-factor sign-in was reset',
      workspace: ctx.org.name,
      paragraphs: [`Hi ${user.name}, ${ctx.user.name} reset your two-factor sign-in for ${ctx.org.name}. You sign in with your password or Google alone until you set it up again in Settings → Security.`, 'If you did not ask for this, tell your workspace owner.'],
      cta: { label: 'Set it up again', href: '/app/settings/security' },
    })
    await sendMail({ orgId: ctx.orgId, to: user.email, subject: `Your two-factor sign-in for ${ctx.org.name} was reset`, ...mail, kind: 'security' })
    revalidatePath('/app/settings/members')
    return ok(`Two-factor sign-in reset for ${user.name}. They can set it up again from Settings → Security.`)
  },
  { perm: 'members.manage', allowReadOnly: true },
)

/** Settings → Security (org.manage): require 2FA for owners and admins. Turning it on needs your own 2FA first. */
export const setRequireTwoFactorAdmins = action(
  z.object({ required: z.boolean() }),
  async ({ required }, ctx) => {
    if (required && !ctx.user.twoFactor?.enabledAt) return fail('Turn on your own two-factor sign-in first, so you are not locked out.')
    await Org.updateOne({ _id: ctx.orgId }, { $set: { 'security.requireTwoFactorAdmins': required } })
    await audit(ctx, { action: required ? 'org.two_factor_required' : 'org.two_factor_optional', entity: 'Org', entityId: ctx.orgId, summary: required ? 'Two-factor sign-in is now required for owners and admins' : 'Two-factor sign-in is no longer required for admins' })
    revalidatePath('/app', 'layout')
    return ok(required ? 'Owners and admins now need two-factor sign-in. Those without it are asked to set it up.' : 'Two-factor sign-in is optional again.')
  },
  { perm: 'org.manage', allowReadOnly: true },
)
