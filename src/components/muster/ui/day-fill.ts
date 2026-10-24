import type { Tone } from '@/lib/status'

/**
 * Day-pill fills from the Figma attendance calendar (mint, amber, pink), extended to the other tones. Light fills
 * take the Figma's slate numerals; strong fills take white. Matches MonthCalendar's pills.
 */
export const DAY_FILL: Record<Tone, { bg: string; ink: string }> = {
  success: { bg: '#70F3C3', ink: '#4F5663' },
  warning: { bg: '#E4BD6D', ink: '#575D6A' },
  danger: { bg: '#F5548C', ink: '#FFFFFF' },
  info: { bg: '#6160FF', ink: '#FFFFFF' },
  pink: { bg: '#FAB5E8', ink: '#4A1D3F' },
  orange: { bg: '#E68763', ink: '#3D1709' },
  violet: { bg: '#5D4083', ink: '#FFFFFF' },
  orchid: { bg: '#8E4C80', ink: '#FFFFFF' },
  neutral: { bg: '#171717', ink: '#575D6A' },
}
