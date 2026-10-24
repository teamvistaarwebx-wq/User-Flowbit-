import { PERMISSION_DEFS, PRODUCTS, isPermission, type AreaKey, type Permission } from '@/lib/catalog'

/**
 * Role rules shared by the roles page and its actions (platform spec 7.4).
 * Pure and client-safe; the catalog decides which permissions exist.
 */

export type PermissionGroup = { area: AreaKey; label: string; description: string; accentVar: string | null; permissions: { key: Permission; label: string }[] }

const CORE_GROUP = { label: 'Workspace', description: 'Settings, members, roles, billing, the audit log and shared clients.', accentVar: null }

/** Permissions grouped by product, in catalog order. */
export function permissionGroups(): PermissionGroup[] {
  const areas: AreaKey[] = ['core', 'work', 'muster', 'orbit', 'folio']
  return areas.map((area) => {
    const product = area === 'core' ? null : PRODUCTS[area]
    return {
      area,
      label: product ? product.name : CORE_GROUP.label,
      description: product ? product.tagline : CORE_GROUP.description,
      accentVar: product ? product.accentVar : CORE_GROUP.accentVar,
      permissions: PERMISSION_DEFS.filter((p) => p.area === area).map((p) => ({ key: p.key, label: p.label })),
    }
  })
}

/** Known keys only, without duplicates, in catalog order. */
export function normalizePermissions(keys: readonly string[]): Permission[] {
  const wanted = new Set(keys.filter(isPermission))
  return PERMISSION_DEFS.map((p) => p.key).filter((k) => wanted.has(k))
}

/** Permissions in `wanted` the actor does not hold (anti-escalation). The owner holds all. */
export function missingGrants(actor: ReadonlySet<string>, wanted: readonly string[]): Permission[] {
  return normalizePermissions(wanted).filter((p) => !actor.has(p))
}

const LABEL = new Map<string, string>(PERMISSION_DEFS.map((p) => [p.key, p.label]))
export const permissionLabel = (key: string) => LABEL.get(key) ?? key

/** "You can't grant 'Approve payroll (finance)': you don't have it yourself." */
export function escalationMessage(missing: readonly string[]): string {
  const names = missing.slice(0, 3).map((k) => `'${permissionLabel(k)}'`).join(', ')
  const more = missing.length > 3 ? ` and ${missing.length - 3} more` : ''
  return `You can't grant ${names}${more}: you don't have ${missing.length === 1 ? 'it' : 'them'} yourself.`
}

/** Added and removed keys between two permission lists. */
export function permissionDiff(before: readonly string[], after: readonly string[]): { added: Permission[]; removed: Permission[] } {
  const b = new Set(before)
  const a = new Set(after)
  return { added: normalizePermissions(after.filter((k) => !b.has(k))), removed: normalizePermissions(before.filter((k) => !a.has(k))) }
}

/**
 * True when making `managerId` the manager of `memberId` would create a loop.
 * `managerOf` maps member id -> manager id.
 */
export function wouldLoop(memberId: string, managerId: string, managerOf: ReadonlyMap<string, string | null | undefined>): boolean {
  if (memberId === managerId) return true
  const seen = new Set<string>()
  let cursor: string | null | undefined = managerId
  while (cursor && !seen.has(cursor)) {
    if (cursor === memberId) return true
    seen.add(cursor)
    cursor = managerOf.get(cursor)
  }
  return false
}
