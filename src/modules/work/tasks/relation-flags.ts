import type { RelationFlag, RelationFlags } from '@/components/work/tasks/types'

/** Task relations (pure, client-safe): kinds and the flags cards show. */

export const RELATION_KINDS = ['blocked_by', 'blocks', 'related'] as const
export type RelationKind = (typeof RELATION_KINDS)[number]

export const RELATION_LABEL: Record<RelationKind, string> = { blocked_by: 'Blocked by', blocks: 'Blocks', related: 'Related' }

export const NO_FLAGS: RelationFlags = { blockedBy: null, blocking: null }

/**
 * Orange "blocked" while any blocker is open, green once all are done.
 * Red "blocking" while this open task holds up an open task, green once it is done.
 */
export function relationFlags(status: string, blockerStatuses: readonly string[], dependentStatuses: readonly string[]): RelationFlags {
  const blockedBy: RelationFlag = blockerStatuses.length ? (blockerStatuses.some((s) => s !== 'done') ? 'open' : 'clear') : null
  let blocking: RelationFlag = null
  if (dependentStatuses.length) blocking = status !== 'done' && dependentStatuses.some((s) => s !== 'done') ? 'open' : 'clear'
  return { blockedBy, blocking }
}

/**
 * True when making `blockerId` block `taskId` closes a loop: `taskId` already
 * (directly or through others) blocks `blockerId`. `blockersOf` gives each task's blockers.
 */
export function closesLoop(taskId: string, blockerId: string, blockersOf: ReadonlyMap<string, readonly string[]>): boolean {
  if (taskId === blockerId) return true
  const seen = new Set<string>()
  const queue = [blockerId]
  while (queue.length) {
    const id = queue.shift() as string
    if (id === taskId) return true
    if (seen.has(id)) continue
    seen.add(id)
    queue.push(...(blockersOf.get(id) ?? []))
  }
  return false
}

/** Shown keys before "and N more" in the open-blockers note. */
const NOTE_KEYS = 2

/** A soft warning when a task is marked done while its blockers are open: "VW-12 is still open". */
export function openBlockersNote(keys: readonly string[]): string | undefined {
  if (!keys.length) return undefined
  if (keys.length === 1) return `${keys[0]} is still open`
  const shown = keys.slice(0, NOTE_KEYS)
  const rest = keys.length - shown.length
  const list = rest ? `${shown.join(', ')} and ${rest} more` : `${shown[0]} and ${shown[1]}`
  return `${list} are still open`
}

/** Which access the other end of a new or removed relation needs: edit when the link is written onto it. */
export function otherEndAccess(kind: RelationKind): 'view' | 'edit' {
  return kind === 'blocks' ? 'edit' : 'view'
}
