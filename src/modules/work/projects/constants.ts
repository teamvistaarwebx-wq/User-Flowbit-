/** Project enums and presets. Pure and client-safe. */

export const PROJECT_STATUSES = ['planning', 'active', 'on_hold', 'completed', 'cancelled'] as const
export type ProjectStatus = (typeof PROJECT_STATUSES)[number]

export const PROJECT_HEALTH = ['on_track', 'at_risk', 'off_track'] as const
export type ProjectHealth = (typeof PROJECT_HEALTH)[number]

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  planning: 'Planning', active: 'Active', on_hold: 'On hold', completed: 'Completed', cancelled: 'Cancelled',
}
export const HEALTH_LABEL: Record<ProjectHealth, string> = { on_track: 'On track', at_risk: 'At risk', off_track: 'Off track' }

/** Colour presets (dark-theme friendly versions of the reference palette). */
export const PROJECT_COLORS = ['#818CF8', '#5EEAB0', '#F5B85C', '#F0507A', '#C084FC', '#F9A8D4', '#60A5FA', '#E8804F'] as const

export const MILESTONE_STATUSES = ['open', 'done'] as const

export const PROJECT_CODE_PATTERN = /^[A-Z0-9-]{2,20}$/
