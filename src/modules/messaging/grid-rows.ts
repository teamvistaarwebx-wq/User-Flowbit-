import { CHANNELS, EVENT_GROUPS, type Channel } from './events'
import { DEFAULT_AVAILABILITY, isFixed, isOptInOnly, resolveChannels, workspaceChannels, type Availability, type ChannelOverride, type PersonalPrefs, type WorkspacePrefs } from './preferences'

/** Rows for the notification grid (pure): what is on, what is fixed, and what differs from the layer below. */

export type GridCell = { on: boolean; fixed: boolean; overridden: boolean }
export type GridRowData = { group: string; label: string; description: string; cells: Record<Channel, GridCell> }

const hasOverride = (list: readonly ChannelOverride[], group: string, channel: Channel) => typeof list.find((o) => o.group === group)?.[channel] === 'boolean'

const row = (group: (typeof EVENT_GROUPS)[number], cell: (channel: Channel) => GridCell): GridRowData => ({
  group: group.key,
  label: group.label,
  description: group.description,
  cells: Object.fromEntries(CHANNELS.map((c) => [c, cell(c)])) as Record<Channel, GridCell>,
})

/** Settings → Workspace alerts: the workspace defaults over Flowbit's. WhatsApp shows on only once the workspace's number is connected. */
export const workspaceGridRows = (workspace: WorkspacePrefs, available: Availability = DEFAULT_AVAILABILITY): GridRowData[] =>
  EVENT_GROUPS.map((g) => {
    const on = workspaceChannels(g, workspace)
    return row(g, (c) => ({ on: on[c] && available[c], fixed: isFixed(g.key, c) || isOptInOnly(g.key, c), overridden: hasOverride(workspace.groups, g.key, c) }))
  })

/** Profile → Notifications: what this person gets, over the workspace defaults. */
export const personalGridRows = (workspace: WorkspacePrefs, personal: PersonalPrefs, available: Availability = DEFAULT_AVAILABILITY): GridRowData[] =>
  EVENT_GROUPS.map((g) => {
    const on = resolveChannels(g.key, workspace, personal, available)
    return row(g, (c) => ({ on: on[c], fixed: isFixed(g.key, c), overridden: hasOverride(personal.groups, g.key, c) }))
  })
