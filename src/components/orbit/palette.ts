import type { LeadStage } from '@/modules/orbit/constants'

/**
 * Orbit's stage colours mapped onto the Figma palette (DESIGN 2.4). The stored config keeps its own keys and hexes
 * (sky, indigo, violet, orchid, amber, mint); on screen they become the filled pill colours the dashboard uses,
 * each with an ink that stays readable on it.
 */
export type Fill = { bg: string; ink: string }

/** Lighter than the table card (#2C2C2E → #383739) so a New pill still reads as a pill on it. */
const NEUTRAL: Fill = { bg: '#4A494D', ink: '#FFFFFF' }

/** Lead stages darken toward money, then resolve: converted teal, lost red. */
export const LEAD_STAGE_FILL: Record<LeadStage, Fill> = {
  new: NEUTRAL,
  contacted: { bg: '#3D3C78', ink: '#E4E3FF' },
  engaged: { bg: '#6160FF', ink: '#FFFFFF' },
  meeting_booked: { bg: '#5D4083', ink: '#FFFFFF' },
  meeting_done: { bg: '#8E4C80', ink: '#FFFFFF' },
  converted: { bg: '#08AD93', ink: '#FFFFFF' },
  lost: { bg: '#E9403B', ink: '#FFFFFF' },
  disqualified: { bg: '#1F1F20', ink: '#A3A1A4' },
}

/** Deal stage config hex (STAGE_COLORS) → Figma fill. Unknown values fall back to the in-progress indigo. */
const DEAL_FILL: Record<string, Fill> = {
  '#60A5FA': { bg: '#3F63C9', ink: '#FFFFFF' },
  '#6366F1': { bg: '#6160FF', ink: '#FFFFFF' },
  '#8B5CF6': { bg: '#5D4083', ink: '#FFFFFF' },
  '#BB62A5': { bg: '#8E4C80', ink: '#FFFFFF' },
  '#F5B85C': { bg: '#E4BD6D', ink: '#3B2C0B' },
  '#5EEAB0': { bg: '#08AD93', ink: '#FFFFFF' },
}

export const WON_FILL: Fill = { bg: '#08AD93', ink: '#FFFFFF' }
export const LOST_FILL: Fill = { bg: '#E9403B', ink: '#FFFFFF' }

export function dealStageFill(color: string | undefined | null): Fill {
  return (color && DEAL_FILL[color.toUpperCase()]) || { bg: '#6160FF', ink: '#FFFFFF' }
}
