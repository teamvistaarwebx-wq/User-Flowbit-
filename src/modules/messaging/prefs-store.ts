import 'server-only'
import type { Types } from 'mongoose'
import { NotificationPrefs } from '@/models/messaging/NotificationPrefs'
import { NotificationSettings } from '@/models/messaging/NotificationSettings'
import { DEFAULT_QUIET_HOURS, EMPTY_PERSONAL_PREFS, type ChannelOverride, type DigestMode, type PersonalPrefs, type QuietHours, type WorkspacePrefs } from './preferences'

/** Reads the workspace defaults and personal overrides into the pure shapes `preferences.ts` resolves. */

type OverrideDoc = { group: string; inapp?: boolean | null; email?: boolean | null; whatsapp?: boolean | null }
type QuietDoc = { enabled?: boolean | null; start?: string | null; end?: string | null } | null | undefined

const overrides = (rows: readonly OverrideDoc[] | null | undefined): ChannelOverride[] =>
  (rows ?? []).map((r) => ({ group: r.group, inapp: r.inapp ?? null, email: r.email ?? null, whatsapp: r.whatsapp ?? null }))

const quiet = (doc: QuietDoc): QuietHours => ({
  enabled: doc?.enabled ?? DEFAULT_QUIET_HOURS.enabled,
  start: doc?.start || DEFAULT_QUIET_HOURS.start,
  end: doc?.end || DEFAULT_QUIET_HOURS.end,
})

export async function loadWorkspacePrefs(orgId: Types.ObjectId): Promise<WorkspacePrefs> {
  const doc = await NotificationSettings.findOne({ orgId }).lean()
  return { groups: overrides(doc?.groups), quietHours: quiet(doc?.quietHours) }
}

type PrefsDoc = NonNullable<Awaited<ReturnType<typeof findOne>>>
const findOne = (orgId: Types.ObjectId, userId: Types.ObjectId | string) => NotificationPrefs.findOne({ orgId, userId }).lean()

export const toPersonalPrefs = (doc: PrefsDoc | null | undefined): PersonalPrefs =>
  doc
    ? {
        groups: overrides(doc.groups),
        quietMode: (doc.quietMode as PersonalPrefs['quietMode']) ?? 'workspace',
        quietHours: quiet(doc.quietHours),
        digest: (doc.digest as DigestMode) ?? 'off',
        snoozeUntil: doc.snoozeUntil ?? null,
      }
    : EMPTY_PERSONAL_PREFS

export async function loadPersonalPrefs(orgId: Types.ObjectId, userId: Types.ObjectId | string): Promise<PersonalPrefs> {
  return toPersonalPrefs(await findOne(orgId, userId))
}

/** Personal prefs for many people at once, keyed by User id (missing = defaults). */
export async function loadPersonalPrefsMany(orgId: Types.ObjectId, userIds: readonly string[]): Promise<Map<string, PersonalPrefs>> {
  const docs = await NotificationPrefs.find({ orgId, userId: { $in: userIds } }).lean()
  return new Map(docs.map((d) => [String(d.userId), toPersonalPrefs(d)]))
}
