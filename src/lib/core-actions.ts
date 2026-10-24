'use server'

import { LOCALES } from '@/lib/i18n'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { action, fail, ok, type ActionResult } from '@/lib/actions'
import { checkInGeoFor, punch, type TodayState } from '@/lib/attendance'
import { audit } from '@/lib/audit'
import { consentRecord, decidePunchGeo, LOCATION_NOTICE_VERSION, needsLocationConsent } from '@/lib/geo'
import { getCtx } from '@/lib/ctx'
import { setActiveOrg } from '@/lib/auth/session'
import { objectId } from '@/lib/validation'
import { Member } from '@/models/Member'
import { Notification } from '@/models/Notification'
import { MOTION_PREFS, User } from '@/models/User'
import { BREAK_TYPES } from '@/lib/break-types'

const geoReading = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180), accuracy: z.number().min(0).max(100_000).nullish() })

/**
 * Check-in widget: in / break_start / break_end / out for the signed-in member. Check-in and check-out carry
 * the browser's location when the workspace asks for it (lib/geo decidePunchGeo: stored, flagged or refused).
 */
export const punchAction = action(
  z.object({ type: z.enum(['in', 'break_start', 'break_end', 'out']), note: z.string().max(200).optional(), breakType: z.enum(BREAK_TYPES).optional(), geo: geoReading.optional() }),
  async ({ type, note, breakType, geo }, ctx): Promise<ActionResult<TodayState>> => {
    const { settings, remote } = await checkInGeoFor(ctx)
    const decision = decidePunchGeo(settings, type, geo, !needsLocationConsent(ctx.member.locationConsent))
    if (!decision.ok) return fail(decision.error)
    const result = await punch(ctx, type, note, { breakType, geo: decision.geo, remote })
    revalidatePath('/app', 'layout')
    return ok(result.message, result.state)
  },
)

/** The member accepts the location notice (shown before the first location read); kept with the notice version and audited. */
export const recordLocationConsentAction = action(
  z.object({ version: z.literal(LOCATION_NOTICE_VERSION) }),
  async (_input, ctx) => {
    if (!needsLocationConsent(ctx.member.locationConsent)) return ok()
    const consent = consentRecord(new Date())
    await Member.updateOne({ _id: ctx.memberId }, { $set: { locationConsent: consent } })
    await audit(ctx, { action: 'attendance.location_consent', entity: 'Member', entityId: ctx.memberId, summary: `Accepted the check-in location notice (v${consent.version})`, product: 'muster', meta: { version: consent.version } })
    return ok()
  },
)

/** Sound on/off, stored on the user (avatar menu and Settings -> Appearance). Works while read-only. */
export const setSoundPrefAction = action(
  z.object({ sound: z.boolean() }),
  async ({ sound }, ctx) => {
    await User.updateOne({ _id: ctx.userId }, { $set: { 'prefs.sound': sound } })
    return ok(sound ? 'Sounds on' : 'Sounds off')
  },
  { allowReadOnly: true, allowBlocked: true, allowWithout2fa: true },
)

/** Reduced motion preference, stored on the user. */
export const setReducedMotionAction = action(
  z.object({ reducedMotion: z.boolean() }),
  async ({ reducedMotion }, ctx) => {
    await User.updateOne({ _id: ctx.userId }, { $set: { 'prefs.reducedMotion': reducedMotion, 'prefs.motion': reducedMotion ? 'reduce' : 'system' } })
    revalidatePath('/app', 'layout')
    return ok(reducedMotion ? 'Reduced motion on' : 'Animations on')
  },
  { allowReadOnly: true, allowBlocked: true, allowWithout2fa: true },
)

/** Settings -> Appearance motion choice: follow the OS, always reduce, or always animate. Keeps `reducedMotion` in sync. */
export const setMotionPrefAction = action(
  z.object({ motion: z.enum(MOTION_PREFS) }),
  async ({ motion }, ctx) => {
    await User.updateOne({ _id: ctx.userId }, { $set: { 'prefs.motion': motion, 'prefs.reducedMotion': motion === 'reduce' } })
    revalidatePath('/app', 'layout')
    return ok(motion === 'reduce' ? 'Motion reduced.' : motion === 'full' ? 'Full motion on.' : 'Motion follows your device.')
  },
  { allowReadOnly: true, allowBlocked: true, allowWithout2fa: true },
)

/** Settings → Profile → Language: English or Hindi for the self-service pages (lib/i18n). */
export const setLocaleAction = action(
  z.object({ locale: z.enum(LOCALES) }),
  async ({ locale }, ctx) => {
    await User.updateOne({ _id: ctx.userId }, { $set: { 'prefs.locale': locale } })
    revalidatePath('/app', 'layout')
    return ok(locale === 'hi' ? 'भाषा हिन्दी पर सेट हो गई।' : 'Language set to English.')
  },
  { allowReadOnly: true, allowBlocked: true, allowWithout2fa: true },
)

/** Workspace switcher. */
export async function switchOrgAction(orgId: string): Promise<ActionResult> {
  const parsed = objectId.safeParse(orgId)
  if (!parsed.success) return fail('Choose a workspace.')
  const ctx = await getCtx()
  if (!ctx) return fail('Your session has ended. Sign in again.')
  const member = await Member.findOne({ orgId: parsed.data, userId: ctx.userId, status: 'active' }).lean()
  if (!member) return fail('You are not a member of that workspace.')
  await setActiveOrg(member.orgId)
  revalidatePath('/app', 'layout')
  return ok('Switched workspace', undefined, '/app')
}

export const markNotificationReadAction = action(
  z.object({ id: objectId }),
  async ({ id }, ctx) => {
    await ctx.db(Notification).updateOne({ _id: id, userId: ctx.userId, readAt: null }, { $set: { readAt: new Date() } })
    return ok()
  },
  { allowReadOnly: true, allowBlocked: true, allowWithout2fa: true },
)

/** Marks a group of the bell's alerts (several updates on one object) read at once. */
export const markNotificationsReadAction = action(
  z.object({ ids: z.array(objectId).min(1).max(100) }),
  async ({ ids }, ctx) => {
    await ctx.db(Notification).updateMany({ _id: { $in: ids }, userId: ctx.userId, readAt: null }, { $set: { readAt: new Date() } })
    return ok()
  },
  { allowReadOnly: true, allowBlocked: true, allowWithout2fa: true },
)

export const markAllNotificationsReadAction = action(
  z.object({}),
  async (_input, ctx) => {
    const res = await ctx.db(Notification).updateMany({ userId: ctx.userId, readAt: null }, { $set: { readAt: new Date() } })
    revalidatePath('/app/notifications')
    return ok(res.modifiedCount ? `Marked ${res.modifiedCount} as read` : 'Nothing unread')
  },
  { allowReadOnly: true, allowBlocked: true, allowWithout2fa: true },
)
