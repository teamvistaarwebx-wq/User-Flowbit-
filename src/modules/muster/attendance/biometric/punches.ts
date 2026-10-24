import { clockOf, previousDay } from './datetime'
import type { RawPunch } from './formats'
import { DEFAULT_CUTOFF } from './types'

/**
 * Raw punches → one day per person (pure). Punches are grouped by device id and IST date; a punch
 * after midnight but before the cutoff belongs to the previous day's shift. The first punch is the
 * in time and the last the out time; punches under two minutes after the one before are repeats.
 */

export { DEFAULT_CUTOFF }
/** The latest cutoff accepted: 06:00 the next morning. */
export const MAX_CUTOFF = '06:00'
export const DUPLICATE_WINDOW_SECONDS = 120
const DAY_SECONDS = 86_400

export type PunchDay = {
  deviceId: string
  date: string
  /** "HH:MM"; 24:00 and later is the next morning. */
  in: string
  out?: string
  punches: number
  duplicates: number
  /** File lines of the punches kept, in time order. */
  lines: number[]
  warnings: string[]
}

export type BuildOptions = { cutoff?: string; duplicateWindowSeconds?: number }

/** "04:00" → 14400 seconds; null when not HH:MM between 00:00 and 06:00. */
export function cutoffSeconds(raw: string | undefined): number | null {
  const v = (raw ?? DEFAULT_CUTOFF).trim()
  const m = /^(\d{1,2}):([0-5]\d)$/.exec(v)
  if (!m) return null
  const seconds = Number(m[1]) * 3600 + Number(m[2]) * 60
  const [maxH, maxM] = MAX_CUTOFF.split(':').map(Number)
  return seconds <= maxH * 3600 + maxM * 60 ? seconds : null
}

/** Matching key for a device user id: trimmed, lower-cased, leading zeros dropped ("0007" = "7"). */
export const deviceKey = (id: string): string => {
  const v = id.trim().toLowerCase()
  return /^\d+$/.test(v) ? v.replace(/^0+(?=\d)/, '') : v
}

type Shifted = RawPunch & { shiftDate: string; offset: number }

function shiftOf(p: RawPunch, cutoff: number): Shifted {
  return p.seconds < cutoff ? { ...p, shiftDate: previousDay(p.date), offset: p.seconds + DAY_SECONDS } : { ...p, shiftDate: p.date, offset: p.seconds }
}

/** Drops punches less than the window after the last one kept. */
function withoutRepeats(sorted: readonly Shifted[], window: number): Shifted[] {
  return sorted.reduce<Shifted[]>((kept, p) => {
    const last = kept[kept.length - 1]
    return last && p.offset - last.offset < window ? kept : [...kept, p]
  }, [])
}

function dayOf(group: readonly Shifted[], window: number): PunchDay {
  const sorted = [...group].sort((a, b) => a.offset - b.offset || a.line - b.line)
  const kept = withoutRepeats(sorted, window)
  const first = kept[0]
  const last = kept.length > 1 ? kept[kept.length - 1] : undefined
  const duplicates = sorted.length - kept.length
  const warnings = [
    ...(last ? [] : ['Only one punch: missing out.']),
    ...(duplicates ? [`${duplicates} repeat ${duplicates === 1 ? 'punch' : 'punches'} within 2 minutes ignored.`] : []),
    ...(first.offset >= DAY_SECONDS ? [`First punch at ${clockOf(first.offset - DAY_SECONDS)} after midnight, counted for the day before.`] : []),
    ...(last && last.offset >= DAY_SECONDS ? [`Out punch at ${clockOf(last.offset - DAY_SECONDS)} after midnight, counted for this day's shift.`] : []),
    ...(first.direction === 'out' ? ['The device marked the first punch as out.'] : []),
  ]
  return { deviceId: first.deviceId.trim(), date: first.shiftDate, in: clockOf(first.offset), out: last ? clockOf(last.offset) : undefined, punches: sorted.length, duplicates, lines: kept.map((p) => p.line), warnings }
}

/** Groups punches into days, sorted by device id then date. */
export function buildDays(punches: readonly RawPunch[], options: BuildOptions = {}): PunchDay[] {
  const cutoff = cutoffSeconds(options.cutoff)
  if (cutoff === null) throw new Error(`The cutoff must be HH:MM between 00:00 and ${MAX_CUTOFF}.`)
  const window = options.duplicateWindowSeconds ?? DUPLICATE_WINDOW_SECONDS
  const groups = new Map<string, Shifted[]>()
  for (const p of punches) {
    const shifted = shiftOf(p, cutoff)
    const key = `${deviceKey(p.deviceId)}|${shifted.shiftDate}`
    const group = groups.get(key)
    if (group) group.push(shifted)
    else groups.set(key, [shifted])
  }
  return [...groups.values()]
    .map((g) => dayOf(g, window))
    .sort((a, b) => deviceKey(a.deviceId).localeCompare(deviceKey(b.deviceId), 'en', { numeric: true }) || a.date.localeCompare(b.date))
}
