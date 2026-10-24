/**
 * Member skills and local time zone (Settings → Profile; team member cards
 * and the "who knows" filter). Pure and client-safe.
 */

export const MAX_SKILLS = 20
export const MAX_SKILL_LENGTH = 40

/** "Figma, SEO,  figma , Hindi copy" → ['Figma', 'SEO', 'Hindi copy']: trimmed, de-duplicated (case-insensitive), capped. */
export function parseSkills(raw: string | readonly string[] | null | undefined): string[] {
  const parts = typeof raw === 'string' ? raw.split(/[,\n]/) : [...(raw ?? [])]
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of parts) {
    const skill = part.replace(/\s+/g, ' ').trim().slice(0, MAX_SKILL_LENGTH)
    const key = skill.toLowerCase()
    if (!skill || seen.has(key)) continue
    seen.add(key)
    out.push(skill)
    if (out.length >= MAX_SKILLS) break
  }
  return out
}

/** Whether someone's skills match "who knows X" (any skill containing the words, case-insensitive). */
export function knows(skills: readonly string[] | null | undefined, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return (skills ?? []).some((s) => s.toLowerCase().includes(q))
}

/** Every distinct skill across people, most common first (the filter's suggestions). */
export function skillSuggestions(people: readonly { skills?: readonly string[] | null }[]): string[] {
  const counts = new Map<string, { label: string; n: number }>()
  for (const p of people) for (const s of p.skills ?? []) {
    const key = s.toLowerCase()
    counts.set(key, { label: counts.get(key)?.label ?? s, n: (counts.get(key)?.n ?? 0) + 1 })
  }
  return [...counts.values()].sort((a, b) => b.n - a.n || a.label.localeCompare(b.label)).map((c) => c.label)
}

/** True for an IANA zone this runtime knows ('Asia/Kolkata', 'Europe/London'). */
export function isTimeZone(value: string | null | undefined): value is string {
  if (!value || value.length > 64) return false
  try {
    new Intl.DateTimeFormat('en-IN', { timeZone: value })
    return true
  } catch {
    return false
  }
}

/** Zones offered on the profile (a remote team's usual ones); any valid IANA zone is accepted. */
export const COMMON_TIME_ZONES = ['Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'Asia/Tokyo', 'Australia/Sydney', 'Europe/London', 'Europe/Berlin', 'America/New_York', 'America/Chicago', 'America/Los_Angeles'] as const

/** "3:42 pm" in a zone. */
export const localTimeIn = (zone: string, at: Date = new Date()): string => new Intl.DateTimeFormat('en-IN', { timeZone: zone, hour: 'numeric', minute: '2-digit', hour12: true }).format(at).toLowerCase()
