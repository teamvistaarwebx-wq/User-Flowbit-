import { PRODUCTS, type ProductKey } from '@/lib/catalog'

/**
 * Workspace kind: who runs the workspace, picked first at onboarding ("Who are
 * you?"). Separate from the account type (lib/account-types: Free, Trial,
 * Paid), which is about billing. The kind decides which products, roles and
 * settings the workspace sees; nothing is deleted when it changes. Pure and
 * client-safe; no imports from plans.ts so plans.ts can depend on it.
 */

export const WORKSPACE_KINDS = ['freelancer', 'agency', 'business'] as const
export type WorkspaceKind = (typeof WORKSPACE_KINDS)[number]

/** Workspaces created before the field existed had every product, so they read as agencies. */
export const DEFAULT_WORKSPACE_KIND: WorkspaceKind = 'agency'

export const isWorkspaceKind = (value: unknown): value is WorkspaceKind => typeof value === 'string' && (WORKSPACE_KINDS as readonly string[]).includes(value)

/** The stored kind, or the default for workspaces without one. */
export const workspaceKindOf = (org: { workspaceKind?: string | null } | null | undefined): WorkspaceKind =>
  isWorkspaceKind(org?.workspaceKind) ? org.workspaceKind : DEFAULT_WORKSPACE_KIND

export type WorkspaceKindDef = {
  key: WorkspaceKind
  label: string
  /** Onboarding card: "I'm a freelancer". */
  title: string
  description: string
  bestFor: string
  /** Products the kind can use at all; the plan and Settings → Modules narrow it further. */
  products: readonly ProductKey[]
  /** Built-in roles that make no sense without the products above (hidden from pickers, refused on invite). */
  hiddenRoles: readonly string[]
  /** Onboarding: the team-size answer preselected (kept within the Free seats, so the pick alone never starts a trial). */
  defaultTeamSize: string
  /** Onboarding: what the people invited are called. */
  inviteNoun: string
}

export const WORKSPACE_KIND_DEFS: Record<WorkspaceKind, WorkspaceKindDef> = {
  freelancer: {
    key: 'freelancer',
    label: 'Freelancer',
    title: "I'm a freelancer",
    description: 'Run your own projects, win clients and send GST invoices, with collaborators when you need them.',
    bestFor: 'consultants, designers, developers, creators',
    products: ['work', 'orbit', 'folio'],
    // HR roles only act on Muster (people, attendance, payroll), which a freelancer workspace does not have.
    hiddenRoles: ['hr_admin', 'hr_exec'],
    defaultTeamSize: 'Just myself',
    inviteNoun: 'collaborators',
  },
  agency: {
    key: 'agency',
    label: 'Agency',
    title: 'I run an agency',
    description: 'Deliver client projects with a salaried team: work, people, sales and invoicing together.',
    bestFor: 'digital, creative, marketing and dev agencies',
    products: ['work', 'muster', 'orbit', 'folio'],
    hiddenRoles: [],
    defaultTeamSize: '2-5',
    inviteNoun: 'team members',
  },
  business: {
    key: 'business',
    label: 'Business',
    title: 'I run a business',
    description: 'Manage an in-house team: HR and payroll, tasks, customers and invoicing.',
    bestFor: 'startups, traders, manufacturers, clinics, firms',
    products: ['work', 'muster', 'orbit', 'folio'],
    hiddenRoles: [],
    defaultTeamSize: '2-5',
    inviteNoun: 'team members',
  },
}

/** The kind allows the product (before plan and Settings → Modules). */
export const kindAllowsProduct = (kind: WorkspaceKind, product: ProductKey): boolean => WORKSPACE_KIND_DEFS[kind].products.includes(product)

/** The kind allows the role (custom roles are always allowed; their permissions on hidden products do nothing). */
export const kindAllowsRole = (kind: WorkspaceKind, role: string): boolean => !WORKSPACE_KIND_DEFS[kind].hiddenRoles.includes(role)

/** What switching from `from` to `next` hides, as a sentence, or null when nothing is hidden. */
export function kindChangeNote(from: WorkspaceKind, next: WorkspaceKind): string | null {
  const hidden = WORKSPACE_KIND_DEFS[from].products.filter((p) => !kindAllowsProduct(next, p)).map((p) => PRODUCTS[p].shortName)
  return hidden.length ? `${hidden.join(', ')} is hidden while this is a ${WORKSPACE_KIND_DEFS[next].label.toLowerCase()} workspace. Nothing is deleted; switch back to see it again.` : null
}
