'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { action, fail, ok } from '@/lib/actions'
import { audit } from '@/lib/audit'
import { destroyOtherSessions } from '@/lib/auth/session'
import { hashPassword, passwordSchema, verifyPassword } from '@/lib/auth/password'
import { deleteStoredFile, saveUpload } from '@/lib/files'
import { emailLayout, sendMail } from '@/lib/mail'
import { assertRateLimit } from '@/lib/rate-limit'
import { objectId, optionalText } from '@/lib/validation'
import { pluralize } from '@/lib/utils'
import { isTimeZone, parseSkills } from '@/lib/skills'
import { Member } from '@/models/Member'
import { Session } from '@/models/Session'
import { User } from '@/models/User'
import { deviceLabel } from './format'

/** Profile, avatar, password and sessions: every member, also while the workspace is read-only. */
const SELF = { allowReadOnly: true, allowBlocked: true, allowWithout2fa: true } as const
const AVATAR_TYPES = ['image/png', 'image/jpeg', 'image/webp']
const AVATAR_MAX_BYTES = 2 * 1024 * 1024

export const updateProfile = action(
  z.object({
    name: z.string().trim().min(2, 'Use at least 2 characters for your name.').max(80, 'Use at most 80 characters.'),
    title: optionalText(60),
    skills: z.string().max(1000).optional(),
    timezone: z.string().trim().max(64).optional().refine((v) => !v || isTimeZone(v), 'Choose a time zone from the list'),
  }),
  async ({ name, title, skills, timezone }, ctx) => {
    await User.updateOne({ _id: ctx.userId }, { $set: { name } })
    const parsed = parseSkills(skills)
    const fields: Record<string, unknown> = { title: title || null, skills: parsed.length ? parsed : null, timezone: timezone || null }
    const set = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== null))
    const unset = Object.fromEntries(Object.entries(fields).filter(([, v]) => v === null).map(([k]) => [k, 1]))
    await ctx.db(Member).updateOne({ _id: ctx.memberId }, { ...(Object.keys(set).length ? { $set: set } : {}), ...(Object.keys(unset).length ? { $unset: unset } : {}) })
    revalidatePath('/app', 'layout')
    return ok('Profile saved.')
  },
  SELF,
)

export const uploadAvatar = action(
  z.object({ avatar: z.instanceof(File, { error: 'Choose an image' }) }),
  async ({ avatar }, ctx) => {
    if (!AVATAR_TYPES.includes(avatar.type)) return fail('Use a PNG, JPG or WebP image under 2 MB.', { avatar: 'PNG, JPG or WebP only' })
    const file = await saveUpload(ctx, avatar, { kind: 'avatar', entity: 'User', entityId: ctx.userId, accept: AVATAR_TYPES, maxBytes: AVATAR_MAX_BYTES })
    if (!file) return fail('Choose an image first.', { avatar: 'Choose an image' })
    const previous = ctx.user.avatarFileId
    await User.updateOne({ _id: ctx.userId }, { $set: { avatarFileId: file._id } })
    if (previous) await deleteStoredFile(ctx.orgId, String(previous))
    revalidatePath('/app', 'layout')
    return ok('Photo updated.')
  },
  SELF,
)

export const removeAvatar = action(
  z.object({}),
  async (_input, ctx) => {
    const previous = ctx.user.avatarFileId
    if (!previous) return fail('There is no photo to remove.')
    await User.updateOne({ _id: ctx.userId }, { $unset: { avatarFileId: 1 } })
    await deleteStoredFile(ctx.orgId, String(previous))
    revalidatePath('/app', 'layout')
    return ok('Photo removed.')
  },
  SELF,
)

const passwordChangeSchema = z
  .object({ currentPassword: z.string().max(128).optional(), newPassword: passwordSchema, confirm: z.string({ error: 'Type the new password again' }) })
  .refine((v) => v.newPassword === v.confirm, { path: ['confirm'], message: "The passwords don't match." })

/** Sets a new password and signs out every other session of this user. */
export const changePassword = action(
  passwordChangeSchema,
  async (input, ctx) => {
    await assertRateLimit('passwordChange', String(ctx.userId))
    const user = await User.findById(ctx.userId, { passwordHash: 1, email: 1, name: 1 }).lean()
    if (!user) return fail('Sign in again to change your password.')
    if (user.passwordHash) {
      if (!input.currentPassword || !(await verifyPassword(input.currentPassword, user.passwordHash))) {
        return fail("Your current password isn't right.", { currentPassword: "Your current password isn't right." })
      }
      if (input.currentPassword === input.newPassword) return fail('Choose a password you have not used here.', { newPassword: 'Use a different password from your current one.' })
    }
    if (input.newPassword.toLowerCase() === user.email.toLowerCase()) return fail('Your password cannot be your email.', { newPassword: 'Do not use your email as the password.' })
    const others = await Session.countDocuments({ userId: ctx.userId, _id: { $ne: ctx.session._id } })
    await User.updateOne({ _id: ctx.userId }, { $set: { passwordHash: await hashPassword(input.newPassword) } })
    await destroyOtherSessions(ctx.userId, true)
    const mail = emailLayout({
      title: 'Your Flowbit password was changed',
      paragraphs: [`Hi ${user.name}, the password for ${user.email} was just changed. Other devices and connected AI apps were signed out.`, 'If this was not you, reset your password now from the sign-in page and tell your workspace owner.'],
      cta: { label: 'Reset password', href: '/forgot-password' },
    })
    await sendMail({ to: user.email, subject: 'Your Flowbit password was changed', ...mail, kind: 'security' })
    await audit(ctx, { action: 'user.password_changed', entity: 'User', entityId: ctx.userId, summary: `${user.name} changed their password` })
    return ok(others ? `Password changed. You've been signed out of ${pluralize(others, 'other session')}.` : 'Password changed.')
  },
  SELF,
)

/** Signs out one of your other sessions. */
export const revokeSession = action(
  z.object({ id: objectId }),
  async ({ id }, ctx) => {
    if (id === String(ctx.session._id)) return fail('That is this device. Use Sign out from the avatar menu instead.')
    const session = await Session.findOneAndDelete({ _id: id, userId: ctx.userId }).lean()
    if (!session) return fail('That session has already ended.')
    revalidatePath('/app/settings/security')
    return ok(`Signed out of ${deviceLabel(session.userAgent)}.`)
  },
  SELF,
)

export const revokeOtherSessions = action(
  z.object({}),
  async (_input, ctx) => {
    const others = await Session.countDocuments({ userId: ctx.userId, _id: { $ne: ctx.session._id } })
    if (!others) return fail('You have no other sessions.')
    await destroyOtherSessions(ctx.userId, true)
    revalidatePath('/app/settings/security')
    return ok(`Signed out of ${pluralize(others, 'other session')}.`)
  },
  SELF,
)
