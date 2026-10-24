/** Immutable edits of a client's embedded contacts list. Pure. */

export type ContactLike = { _id?: unknown; name: string; email?: string | null; phone?: string | null; role?: string | null; primary?: boolean | null }

const same = (a: unknown, b: unknown) => a != null && b != null && String(a) === String(b)

/** Ensures exactly one primary when the list is not empty. */
function settlePrimary<T extends ContactLike>(list: T[], preferId?: unknown): T[] {
  if (!list.length) return list
  const target = preferId != null ? list.find((c) => same(c._id, preferId)) : list.find((c) => c.primary)
  const primaryId = (target ?? list[0])._id
  return list.map((c) => ({ ...c, primary: same(c._id, primaryId) }))
}

export function addContactTo<T extends ContactLike>(list: readonly T[], contact: T): T[] {
  const next = [...list, contact]
  return settlePrimary(next, contact.primary || list.length === 0 ? contact._id : undefined)
}

export function updateContactIn<T extends ContactLike>(list: readonly T[], id: unknown, patch: Partial<T>): T[] {
  const next = list.map((c) => (same(c._id, id) ? { ...c, ...patch } : c))
  return settlePrimary(next, patch.primary ? id : undefined)
}

export const makePrimaryIn = <T extends ContactLike>(list: readonly T[], id: unknown): T[] => settlePrimary([...list], id)

export const removeContactFrom = <T extends ContactLike>(list: readonly T[], id: unknown): T[] => settlePrimary(list.filter((c) => !same(c._id, id)))

/** Another contact on the same client already uses this email. */
export const emailTaken = (list: readonly ContactLike[], email: string | null | undefined, exceptId?: unknown) =>
  Boolean(email) && list.some((c) => !same(c._id, exceptId) && (c.email ?? '').toLowerCase() === String(email).toLowerCase())
