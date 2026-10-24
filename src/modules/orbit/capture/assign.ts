/**
 * Who a captured lead goes to (pure): a fixed owner, or round-robin over a
 * pool. The cursor is the count of leads handed out so far (kept with an
 * atomic $inc), so two leads at the same moment go to two people. Inactive
 * members are skipped; with nobody left, the workspace owner takes it.
 */

export const ASSIGN_MODES = ['owner', 'round_robin'] as const
export type AssignMode = (typeof ASSIGN_MODES)[number]

export type AssignInput = Readonly<{ mode: AssignMode; ownerId: string | null; pool: readonly string[]; cursor: number; active: ReadonlySet<string>; fallback: string }>

export function pickAssignee(input: AssignInput): string {
  if (input.mode === 'owner') return input.ownerId && input.active.has(input.ownerId) ? input.ownerId : input.fallback
  const pool = input.pool.filter((id) => input.active.has(id))
  if (!pool.length) return input.ownerId && input.active.has(input.ownerId) ? input.ownerId : input.fallback
  const index = ((input.cursor % pool.length) + pool.length) % pool.length
  return pool[index]
}
