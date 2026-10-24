/** Space and list presets. Pure and client-safe. */

export const SPACE_COLORS = ['#818CF8', '#5EEAB0', '#F5B85C', '#F0507A', '#C084FC', '#F9A8D4', '#60A5FA', '#E8804F'] as const
export const FOLDER_COLORS = ['#7E768C', ...SPACE_COLORS] as const

export const SPACE_ICONS = ['folder', 'rocket', 'palette', 'code', 'megaphone', 'briefcase', 'users', 'heart', 'globe', 'star'] as const
export type SpaceIcon = (typeof SPACE_ICONS)[number]

export const HEX_COLOR = /^#[0-9a-fA-F]{6}$/
