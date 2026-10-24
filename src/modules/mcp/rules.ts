import type { Permission, ProductKey } from '@/lib/catalog'
import { SCOPE_DEFS, type McpScope } from './scopes'

/**
 * What one tool or one planned change needs: a token scope, the product, and
 * a role permission. Checked on every call (scope ∩ role), never cached from
 * consent time. Pure.
 */

export type Requirement = Readonly<{
  scope: McpScope
  /** The role needs one of these (empty = the scope's own list). */
  anyPerm?: readonly Permission[]
  /** Product that must be on; default: the scope's product. */
  product?: ProductKey | null
  /** Writes are refused while the workspace is read-only, and count toward the daily cap. */
  write?: boolean
}>

export type Access = Readonly<{
  scopes: readonly McpScope[]
  can: (perm: Permission) => boolean
  has: (product: ProductKey) => boolean
  writable: boolean
  readOnlyMessage: string
}>

const SCOPE_WORDS: Readonly<Record<McpScope, string>> = {
  'work.read': 'read tasks',
  'work.write': 'create or update tasks',
  'orbit.read': 'read leads and deals',
  'orbit.write': 'update leads and deals',
  'folio.read': 'read invoices',
  'folio.draft': 'draft invoices and quotes',
  'people.read': 'read the team directory',
}

/** Why the call is refused, or null when allowed. */
export function accessRefusal(access: Access, req: Requirement): string | null {
  if (!access.scopes.includes(req.scope)) return `This connection was not given permission to ${SCOPE_WORDS[req.scope]} (scope ${req.scope}). Reconnect the app and tick it on the Flowbit consent screen.`
  const product = req.product === undefined ? SCOPE_DEFS[req.scope].product : req.product
  if (product && !access.has(product)) return `This product (${product}) is not active on the workspace.`
  const perms = req.anyPerm?.length ? req.anyPerm : SCOPE_DEFS[req.scope].anyPerm
  if (!perms.some((p) => access.can(p))) return `Your role in Flowbit does not allow this (needs ${perms.join(' or ')}). Ask a workspace admin.`
  if (req.write && !access.writable) return access.readOnlyMessage
  return null
}

/**
 * Which parts of the background resources (flowbit://workspace/context and
 * flowbit://me/today) a connection may read: a section needs a scope of its
 * product as well as the role, exactly like the tools.
 */
export function resourceSections(access: Access) {
  const anyScope = (...scopes: McpScope[]) => scopes.some((s) => access.scopes.includes(s))
  const work = anyScope('work.read', 'work.write') && access.has('work')
  const orbit = anyScope('orbit.read', 'orbit.write') && access.has('orbit') && access.can('orbit.read')
  const folio = anyScope('folio.read', 'folio.draft') && access.has('folio') && access.can('folio.read')
  return { work, orbit, folio, myDay: work && access.scopes.includes('work.read'), followups: access.scopes.includes('orbit.read') && access.has('orbit') && access.can('orbit.read') }
}

/** What undoing a batch needs per record type it touched: the same write scope and role as making that change. */
const UNDO_REQUIREMENTS: Readonly<Record<string, Requirement>> = {
  Task: { scope: 'work.write', anyPerm: ['tasks.write'], write: true },
  TaskComment: { scope: 'work.write', anyPerm: ['tasks.write'], write: true },
  Lead: { scope: 'orbit.write', anyPerm: ['leads.write'], write: true },
  Activity: { scope: 'orbit.write', anyPerm: ['activities.write', 'leads.write'], write: true },
  StageEvent: { scope: 'orbit.write', anyPerm: ['leads.write', 'deals.write', 'orbit.close'], write: true },
  Deal: { scope: 'orbit.write', anyPerm: ['deals.write', 'orbit.close'], write: true },
  Invoice: { scope: 'folio.draft', anyPerm: ['invoices.write'], write: true },
  Quote: { scope: 'folio.draft', anyPerm: ['quotes.write'], write: true },
}

/**
 * Why this connection may not undo a batch, or null: only the connection that
 * applied it, with the write scope and role for every record type it touched,
 * in a workspace that is not read-only.
 */
export function undoAccessRefusal(access: Access, batch: Readonly<{ grantId?: unknown; models: readonly string[] }>, grantId: string): string | null {
  if (!batch.grantId || String(batch.grantId) !== grantId) return 'Only the app connection that applied this batch can undo it here. Undo it in Flowbit (Settings → Connected apps → History) instead.'
  if (!access.writable) return access.readOnlyMessage
  for (const model of new Set(batch.models)) {
    const req = UNDO_REQUIREMENTS[model]
    if (!req) return 'This batch cannot be undone from an AI app. Undo it in Flowbit instead.'
    const refusal = accessRefusal(access, req)
    if (refusal) return refusal
  }
  return null
}
