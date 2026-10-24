/**
 * Digest batching (pure): held alerts whose slot has come are grouped per
 * workspace and person, oldest first. A group of one goes out as itself; a
 * larger group becomes one digest email.
 */

export type HeldAlert = Readonly<{ orgId: unknown; userId?: unknown; to: readonly string[]; createdAt: Date }>

export function groupForDigest<T extends HeldAlert>(rows: readonly T[]): T[][] {
  const groups = new Map<string, T[]>()
  const sorted = [...rows].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
  for (const row of sorted) {
    if (!row.orgId) continue
    const key = `${String(row.orgId)}:${row.userId ? String(row.userId) : (row.to[0] ?? '').toLowerCase()}`
    groups.set(key, [...(groups.get(key) ?? []), row])
  }
  return [...groups.values()]
}

export const digestShape = (group: readonly HeldAlert[]): 'single' | 'digest' => (group.length === 1 ? 'single' : 'digest')
