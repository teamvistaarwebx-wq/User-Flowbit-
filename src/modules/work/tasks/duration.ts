import { WORKDAY_MINUTES } from './constants'

const UNIT_MINUTES: Record<string, number> = { w: 5 * WORKDAY_MINUTES, d: WORKDAY_MINUTES, h: 60, m: 1 }

/**
 * Parses an estimate into minutes: "1h 30m", "90m", "2d", "1w", "1.5" (a bare
 * number is hours). Returns null for anything else or zero.
 */
export function parseDuration(input: string): number | null {
  const text = input.trim().toLowerCase().replace(/\s+/g, '')
  if (!text) return null
  if (/^\d+(\.\d+)?$/.test(text)) {
    const minutes = Math.round(Number(text) * 60)
    return minutes > 0 ? minutes : null
  }
  const parts = [...text.matchAll(/(\d+(?:\.\d+)?)([wdhm])/g)]
  if (!parts.length || parts.map((p) => p[0]).join('') !== text) return null
  const minutes = Math.round(parts.reduce((sum, [, n, unit]) => sum + Number(n) * UNIT_MINUTES[unit], 0))
  return minutes > 0 ? minutes : null
}
