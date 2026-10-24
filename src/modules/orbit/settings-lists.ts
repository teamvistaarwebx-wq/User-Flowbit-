/** Helpers for the Orbit settings list editors. Pure. */
import { keyFromLabel } from './constants'

type Keyed = { key?: string; label: string }

/** Keeps existing keys, mints new unique keys from labels (never one of `reserved`). */
export function assignKeys<T extends Keyed>(items: readonly T[], existing: readonly { key: string }[], reserved: readonly string[] = []): (T & { key: string })[] {
  const known = new Set(existing.map((e) => e.key))
  const used = new Set<string>([...reserved])
  const kept = items.map((i) => (i.key && known.has(i.key) ? i.key : null))
  kept.forEach((k) => k && used.add(k))
  return items.map((item, i) => {
    if (kept[i]) return { ...item, key: kept[i] as string }
    const base = keyFromLabel(item.label)
    let candidate = base
    for (let n = 2; used.has(candidate); n += 1) candidate = `${base}_${n}`
    used.add(candidate)
    return { ...item, key: candidate }
  })
}

/** Items present before and missing now. */
export const removedKeys = <E extends { key: string; label: string }>(existing: readonly E[], items: readonly Keyed[]): E[] => existing.filter((e) => !items.some((i) => i.key === e.key))

/** The first label used twice (case-insensitive), or null. */
export function duplicateLabel(items: readonly Keyed[]): string | null {
  const seen = new Set<string>()
  for (const i of items) {
    const k = i.label.trim().toLowerCase()
    if (seen.has(k)) return i.label.trim()
    seen.add(k)
  }
  return null
}
