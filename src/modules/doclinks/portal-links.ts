import { linkState } from './token'

/**
 * The client portal's document links, planned in one pass (pure): a document
 * with a live link uses it; one whose link staff turned off stays hidden from
 * the portal (so "Turn off link" sticks); one that never had a live link (or
 * only expired ones) gets a new link.
 */

export type ExistingLink = Readonly<{ docId: { toString(): string }; key: string; revokedAt?: Date | null; expiresAt?: Date | null; createdAt?: Date | null }>

export type PortalLinkPlan = Readonly<{ live: ReadonlyMap<string, string>; create: readonly string[]; hidden: ReadonlySet<string> }>

const newestFirst = (a: ExistingLink, b: ExistingLink) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0)

export function planPortalLinks(docIds: readonly string[], links: readonly ExistingLink[], now: Date): PortalLinkPlan {
  const live = new Map<string, string>()
  const create: string[] = []
  const hidden = new Set<string>()
  for (const id of new Set(docIds)) {
    const own = links.filter((l) => String(l.docId) === id).sort(newestFirst)
    const active = own.find((l) => linkState(l, now) === 'active')
    if (active) live.set(id, active.key)
    else if (own.some((l) => linkState(l, now) === 'revoked')) hidden.add(id)
    else create.push(id)
  }
  return { live, create, hidden }
}
