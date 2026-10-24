import type { Permission, ProductKey } from '@/lib/catalog'

/**
 * MCP OAuth scopes (docs/specs/mcp.md A1). A token carries the scopes the
 * person approved, cut down to what their role allows when they approved;
 * every tool call checks the scope AND the role's current permissions again
 * (a role can change after consent). Pure, client-safe.
 */

export const MCP_SCOPES = ['work.read', 'work.write', 'orbit.read', 'orbit.write', 'folio.read', 'folio.draft', 'people.read'] as const
export type McpScope = (typeof MCP_SCOPES)[number]

export type ScopeDef = Readonly<{
  label: string
  description: string
  /** Product that must be switched on; null for workspace-wide. */
  product: ProductKey | null
  /** The role needs at least one of these permissions. */
  anyPerm: readonly Permission[]
}>

export const SCOPE_DEFS: Readonly<Record<McpScope, ScopeDef>> = {
  'work.read': { label: 'Read tasks and projects', description: 'Tasks, projects, comments and your day.', product: 'work', anyPerm: ['tasks.read', 'projects.read'] },
  'work.write': { label: 'Create and update tasks', description: 'New tasks, status, assignee, due date, comments. Never deletes.', product: 'work', anyPerm: ['tasks.write'] },
  'orbit.read': { label: 'Read leads and deals', description: 'Leads, deals, activities and the pipeline.', product: 'orbit', anyPerm: ['orbit.read'] },
  'orbit.write': { label: 'Update leads and deals', description: 'Create or update leads, log activities, follow-ups, move deals.', product: 'orbit', anyPerm: ['leads.write', 'activities.write', 'deals.write'] },
  'folio.read': { label: 'Read invoices and receivables', description: 'Invoices, quotes, who owes what, client statements.', product: 'folio', anyPerm: ['folio.read'] },
  'folio.draft': { label: 'Draft invoices and quotes', description: 'Drafts only. Issuing, payments and voiding stay in Flowbit.', product: 'folio', anyPerm: ['invoices.write', 'quotes.write'] },
  'people.read': { label: 'Read the team directory', description: 'Names, teams, managers and who is on leave. Never salary, PAN or bank.', product: null, anyPerm: ['tasks.read', 'people.read', 'leave.read'] },
}

export const isMcpScope = (value: unknown): value is McpScope => typeof value === 'string' && (MCP_SCOPES as readonly string[]).includes(value)

/** "work.read orbit.write junk" → the known scopes, in catalog order, once each. */
export function parseScopes(raw: string | readonly string[] | null | undefined): McpScope[] {
  const words = typeof raw === 'string' ? raw.split(/[\s,]+/) : [...(raw ?? [])]
  const set = new Set(words.filter(isMcpScope))
  return MCP_SCOPES.filter((s) => set.has(s))
}

export type RoleView = Readonly<{ permissions: ReadonlySet<string>; products: readonly string[] }>

/** The scope is usable by this role in this workspace now: product on and at least one permission. */
export function roleAllowsScope(scope: McpScope, role: RoleView): boolean {
  const def = SCOPE_DEFS[scope]
  if (def.product && !role.products.includes(def.product)) return false
  return def.anyPerm.some((p) => role.permissions.has(p))
}

/** Requested ∩ allowed by the role. An empty request means "everything the role allows". */
export function grantableScopes(requested: readonly McpScope[], role: RoleView): McpScope[] {
  const wanted = requested.length ? requested : MCP_SCOPES
  return MCP_SCOPES.filter((s) => wanted.includes(s) && roleAllowsScope(s, role))
}

export const scopeString = (scopes: readonly McpScope[]) => scopes.join(' ')
