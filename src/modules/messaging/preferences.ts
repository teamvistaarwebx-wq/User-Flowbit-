import { CHANNELS, groupByKey, type Channel, type ChannelSet, type EventGroup } from './events'

/**
 * Who gets what, where (notifications-v2 §5). Three layers, later wins:
 *   1. Flowbit's defaults per event group (events.ts),
 *   2. the workspace defaults an admin sets (Settings → Workspace alerts),
 *   3. the person's own overrides (Profile → Notifications),
 * then the fixed rules (payslips never WhatsApp, security always email) and
 * what the workspace can deliver at all (WhatsApp needs a connected number).
 */

export type ChannelOverride = Readonly<{ group: string; inapp?: boolean | null; email?: boolean | null; whatsapp?: boolean | null }>

export type DigestMode = 'off' | 'hourly' | 'daily'

export type QuietHours = Readonly<{ enabled: boolean; start: string; end: string }>

export const DEFAULT_QUIET_HOURS: QuietHours = { enabled: true, start: '21:00', end: '08:00' }

export type WorkspacePrefs = Readonly<{ groups: readonly ChannelOverride[]; quietHours: QuietHours }>

export type PersonalPrefs = Readonly<{
  groups: readonly ChannelOverride[]
  /** 'workspace' follows the workspace's quiet hours; 'custom' uses `quietHours`; 'off' never holds anything back. */
  quietMode: 'workspace' | 'custom' | 'off'
  quietHours: QuietHours
  digest: DigestMode
  snoozeUntil: Date | null
}>

export const EMPTY_WORKSPACE_PREFS: WorkspacePrefs = { groups: [], quietHours: DEFAULT_QUIET_HOURS }
export const EMPTY_PERSONAL_PREFS: PersonalPrefs = { groups: [], quietMode: 'workspace', quietHours: DEFAULT_QUIET_HOURS, digest: 'off', snoozeUntil: null }

/** Channels this workspace can deliver on today. WhatsApp stays off until a number is connected. */
export type Availability = Readonly<Record<Channel, boolean>>
export const DEFAULT_AVAILABILITY: Availability = { inapp: true, email: true, whatsapp: false }

const pick = (overrides: readonly ChannelOverride[], group: string, channel: Channel): boolean | undefined => {
  const value = overrides.find((o) => o.group === group)?.[channel]
  return typeof value === 'boolean' ? value : undefined
}

/** The workspace's value for one group (admin default, else Flowbit's), before personal overrides. */
export function workspaceChannels(group: EventGroup, workspace: WorkspacePrefs): ChannelSet {
  const entries = CHANNELS.map((c) => [c, group.optInOnly?.[c] ? false : (group.fixed?.[c] ?? pick(workspace.groups, group.key, c) ?? group.defaults[c])] as const)
  return Object.fromEntries(entries) as Record<Channel, boolean>
}

/** The channels one person gets for one event group. */
export function resolveChannels(groupKey: string, workspace: WorkspacePrefs, personal: PersonalPrefs, available: Availability = DEFAULT_AVAILABILITY): ChannelSet {
  const group = groupByKey(groupKey)
  const base = workspaceChannels(group, workspace)
  const entries = CHANNELS.map((c) => {
    // An opt-in-only channel is on only when the person switched it on themselves.
    const chosen = group.optInOnly?.[c] ? pick(personal.groups, group.key, c) === true : (group.fixed?.[c] ?? pick(personal.groups, group.key, c) ?? base[c])
    return [c, chosen && available[c]] as const
  })
  return Object.fromEntries(entries) as Record<Channel, boolean>
}

/** True when the person may not change this cell (a fixed rule). */
export const isFixed = (groupKey: string, channel: Channel): boolean => groupByKey(groupKey).fixed?.[channel] !== undefined

/** True when only the person (never the workspace default) may switch this cell on. */
export const isOptInOnly = (groupKey: string, channel: Channel): boolean => Boolean(groupByKey(groupKey).optInOnly?.[channel])

/** The quiet hours that apply to a person, or null when nothing is held back. */
export function effectiveQuietHours(workspace: WorkspacePrefs, personal: PersonalPrefs): QuietHours | null {
  if (personal.quietMode === 'off') return null
  const hours = personal.quietMode === 'custom' ? personal.quietHours : workspace.quietHours
  return hours.enabled ? hours : null
}

/** Replaces one cell of an override list, returning a new list (null clears the override). */
export function setOverride(list: readonly ChannelOverride[], group: string, channel: Channel, value: boolean | null): ChannelOverride[] {
  const current = list.find((o) => o.group === group) ?? { group }
  const next = { ...current, [channel]: value }
  const others = list.filter((o) => o.group !== group)
  const empty = CHANNELS.every((c) => typeof next[c] !== 'boolean')
  return empty ? others : [...others, next]
}
