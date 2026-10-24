'use server'

import type { Types } from 'mongoose'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { action, fail, ok } from '@/lib/actions'
import { audit } from '@/lib/audit'
import { formatDateTime } from '@/lib/dates'
import { hhmm, isoDate } from '@/lib/validation'
import { NotificationPrefs } from '@/models/messaging/NotificationPrefs'
import { NotificationSettings } from '@/models/messaging/NotificationSettings'
import { CHANNELS, isGroupKey } from './events'
import { isFixed, setOverride } from './preferences'
import { loadPersonalPrefs, loadWorkspacePrefs } from './prefs-store'
import { snoozeUntil } from './timing'
import { User } from '@/models/User'
import { isWhatsAppConnected } from '@/modules/whatsapp/connection'
import { canMessageOnWhatsApp } from '@/modules/whatsapp/recipients'

/** Settings → Workspace alerts (workspace defaults) and Settings → My alerts (personal overrides). */

const WORKSPACE_PATH = '/app/settings/notifications'
const FIXED_TEXT = 'Flowbit fixes this one: security emails always go, and Flowbit account notices never come from your workspace’s WhatsApp.'
const PERSONAL_PATH = '/app/settings/profile/notifications'

const cell = z.object({
  group: z.string().refine(isGroupKey, 'Unknown notification group'),
  channel: z.enum(CHANNELS),
  /** null = follow the default again. */
  value: z.boolean().nullable(),
})

const quiet = z.object({ enabled: z.boolean(), start: hhmm, end: hhmm })

export const setWorkspaceChannel = action(
  cell,
  async ({ group, channel, value }, ctx) => {
    if (isFixed(group, channel)) return fail(FIXED_TEXT)
    if (channel === 'whatsapp' && value && !(await isWhatsAppConnected(ctx.orgId))) return fail('Connect WhatsApp first in Settings → Integrations → WhatsApp.')
    const current = await loadWorkspacePrefs(ctx.orgId)
    const groups = setOverride(current.groups, group, channel, value)
    await NotificationSettings.updateOne({ orgId: ctx.orgId }, { $set: { groups, updatedBy: ctx.userId } }, { upsert: true })
    await audit(ctx, { action: 'notifications.defaults_changed', entity: 'NotificationSettings', entityId: ctx.orgId, summary: `Workspace ${channel} default for "${group}" set to ${value === null ? 'Flowbit default' : value ? 'on' : 'off'}` })
    revalidatePath(WORKSPACE_PATH)
    return ok()
  },
  { perm: 'org.manage' },
)

export const setWorkspaceQuietHours = action(
  quiet,
  async (input, ctx) => {
    await NotificationSettings.updateOne({ orgId: ctx.orgId }, { $set: { quietHours: input, updatedBy: ctx.userId } }, { upsert: true })
    await audit(ctx, { action: 'notifications.quiet_hours_changed', entity: 'NotificationSettings', entityId: ctx.orgId, summary: input.enabled ? `Quiet hours set to ${input.start}–${input.end} IST` : 'Quiet hours turned off' })
    revalidatePath(WORKSPACE_PATH)
    return ok(input.enabled ? `Quiet hours: ${input.start} to ${input.end} IST.` : 'Quiet hours are off for the workspace.')
  },
  { perm: 'org.manage' },
)

// Personal settings work even in a read-only or paused workspace: they only change what reaches the person.
const PERSONAL = { allowReadOnly: true, allowBlocked: true } as const

const savePersonal = (ctx: { orgId: Types.ObjectId; userId: Types.ObjectId }, set: Record<string, unknown>) =>
  NotificationPrefs.updateOne({ orgId: ctx.orgId, userId: ctx.userId }, { $set: set }, { upsert: true })

export const setMyChannel = action(
  cell,
  async ({ group, channel, value }, ctx) => {
    if (isFixed(group, channel)) return fail(FIXED_TEXT)
    if (channel === 'whatsapp' && value) {
      if (!(await isWhatsAppConnected(ctx.orgId))) return fail('WhatsApp alerts arrive once your workspace connects WhatsApp.')
      const user = await User.findById(ctx.userId, { phone: 1, phoneVerifiedAt: 1, whatsapp: 1 }).lean()
      if (!user || !canMessageOnWhatsApp({ id: String(user._id), phone: user.phone, phoneVerifiedAt: user.phoneVerifiedAt, whatsapp: user.whatsapp })) return fail('Verify your number and turn on WhatsApp in Settings → My account first.')
    }
    const current = await loadPersonalPrefs(ctx.orgId, ctx.userId)
    await savePersonal(ctx, { groups: setOverride(current.groups, group, channel, value) })
    revalidatePath(PERSONAL_PATH)
    return ok()
  },
  PERSONAL,
)

export const setMyDelivery = action(
  z.object({ digest: z.enum(['off', 'hourly', 'daily']), quietMode: z.enum(['workspace', 'custom', 'off']), quietHours: quiet }),
  async (input, ctx) => {
    await savePersonal(ctx, input)
    revalidatePath(PERSONAL_PATH)
    return ok('Saved.')
  },
  PERSONAL,
)

export const snoozeMyAlerts = action(
  z.object({ preset: z.enum(['1h', 'today', 'date', 'off']), date: isoDate.optional() }),
  async ({ preset, date }, ctx) => {
    if (preset === 'off') {
      await savePersonal(ctx, { snoozeUntil: null })
      revalidatePath(PERSONAL_PATH)
      return ok('Alerts are back on.')
    }
    const until = snoozeUntil(preset, new Date(), date)
    if (until.getTime() <= Date.now()) return fail('Pick a day after today.')
    await savePersonal(ctx, { snoozeUntil: until })
    revalidatePath(PERSONAL_PATH)
    return ok(`Alert emails paused until ${formatDateTime(until)}. The bell still collects them.`)
  },
  PERSONAL,
)

export const resetMyPrefs = action(
  z.object({}),
  async (_input, ctx) => {
    await NotificationPrefs.deleteOne({ orgId: ctx.orgId, userId: ctx.userId })
    revalidatePath(PERSONAL_PATH)
    return ok('Back to the workspace defaults.')
  },
  PERSONAL,
)
