/**
 * Client portal rules (pure): who may sign in and what a contact may see.
 * Everything a contact sees belongs to their own client in their own
 * workspace; the server builds every query from the session, never from input.
 */

export const PORTAL_COOKIE = 'fb_portal'
export const PORTAL_COOKIE_PATH = '/portal'
export const PORTAL_SESSION_DAYS = 14
export const PORTAL_SESSION_SECONDS = PORTAL_SESSION_DAYS * 24 * 60 * 60

/** The one answer to a failed code, whoever asks: it never tells a contact from a stranger. */
export const PORTAL_CODE_REFUSAL = 'That code did not work. Check it, or request a new code (codes last 10 minutes and allow five tries).'

export type PortalOrgLike = Readonly<{ portalOn: boolean; deleted: boolean }>
export type PortalClientLike = Readonly<{ enabled: boolean; status?: string | null }>
export type PortalContactLike = Readonly<{ status: string }>

/** Why this contact cannot use the portal now, or null. Same wording for every refusal at sign-in. */
export function portalRefusal(org: PortalOrgLike | null, client: PortalClientLike | null, contact: PortalContactLike | null): string | null {
  if (!org || org.deleted || !org.portalOn) return 'This portal is not available.'
  // A missing status reads as active (older clients); any other status (inactive, archived) closes the portal.
  if (!client || !client.enabled || (client.status ?? 'active') !== 'active') return 'This portal is not available.'
  if (!contact || contact.status !== 'active') return 'This portal is not available.'
  return null
}

type Id = { toString(): string }
export type TaskForPortal = Readonly<{ clientVisible?: boolean | null; clientId?: Id | null; projectId?: Id | null; approval?: { status?: string | null } | null }>

/**
 * A task the contact may see: marked client-visible (or waiting on their
 * approval) and the client's own: its client is this client, or its project
 * is one the agency shared with this client.
 */
export function taskVisibleTo(task: TaskForPortal, clientId: string, sharedProjectIds: ReadonlySet<string>): boolean {
  const shown = Boolean(task.clientVisible) || task.approval?.status === 'requested'
  if (!shown) return false
  if (task.clientId && String(task.clientId) === clientId) return true
  return Boolean(task.projectId && sharedProjectIds.has(String(task.projectId)))
}

/** The Mongo filter for the same rule (scoped by orgId through the tenant wrapper). */
export function visibleTaskFilter(clientId: Id, sharedProjectIds: readonly Id[]) {
  return {
    $and: [
      { $or: [{ clientVisible: true }, { 'approval.status': 'requested' }] },
      { $or: [{ clientId }, ...(sharedProjectIds.length ? [{ projectId: { $in: sharedProjectIds } }] : [])] },
    ],
  }
}

/** Invoices a contact sees: issued ones of their client, never the opening-balance rows (those have no document page). */
export function portalInvoiceFilter(clientId: Id) {
  return { clientId, status: { $in: ['issued', 'part_paid', 'paid'] }, billingType: { $ne: 'opening' } }
}

export const APPROVAL_DECISIONS = ['approved', 'changes_requested'] as const
export type ApprovalDecision = (typeof APPROVAL_DECISIONS)[number]

/** Why a decision cannot be recorded, or null. Request changes needs a comment. */
export function decisionRefusal(approvalStatus: string | null | undefined, decision: ApprovalDecision, comment: string): string | null {
  if (approvalStatus !== 'requested') return 'This is no longer waiting for your approval.'
  if (decision === 'changes_requested' && comment.trim().length < 3) return 'Tell the team what to change.'
  return null
}

export const APPROVAL_LABEL: Readonly<Record<string, string>> = { requested: 'Waiting for you', approved: 'Approved', changes_requested: 'Changes requested' }
