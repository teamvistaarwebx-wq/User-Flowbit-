import 'server-only'
import type { Types } from 'mongoose'
import type { Ctx } from '@/lib/ctx'
import { diff } from '@/lib/audit-diff'
import { requestIp, requestUserAgent } from '@/lib/request'
import { AuditLog } from '@/models/AuditLog'

export { diff } from '@/lib/audit-diff'

export type AuditEntry = {
  /** Dotted verb: 'invoice.issued', 'member.role_changed', 'payroll.approved'. */
  action: string
  /** Entity type: 'Invoice', 'Member', 'PayrollCycle'. */
  entity: string
  entityId?: unknown
  /** Plain sentence shown in the audit log: "Issued invoice INV/012/2026-27 to Acme". */
  summary: string
  product?: string
  meta?: Record<string, unknown>
  /**
   * Record state before/after the change; stored as meta.before/meta.after
   * holding only the changed keys (create: after only; delete/void: before only).
   */
  changes?: { before?: object | null; after?: object | null; redactIds?: boolean }
}

type AuditCtx = Pick<Ctx, 'orgId' | 'userId' | 'user'> & Partial<Pick<Ctx, 'memberId' | 'role' | 'roleLabel'>>

function metaOf(entry: AuditEntry): Record<string, unknown> | undefined {
  if (!entry.changes) return entry.meta
  const { before, after, redactIds } = entry.changes
  return { ...entry.meta, ...diff(before, after, { redactIds }) }
}

/** Writes an audit log row for a meaningful change. Never throws into the caller's flow (failures are logged). */
export async function audit(ctx: AuditCtx, entry: AuditEntry): Promise<void> {
  try {
    const [ip, userAgent] = await Promise.all([requestIp(), requestUserAgent()])
    await AuditLog.create({
      orgId: ctx.orgId,
      actorId: ctx.userId,
      actorMemberId: ctx.memberId,
      actorName: ctx.user.name,
      actorRole: ctx.roleLabel ?? ctx.role,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId == null ? undefined : String(entry.entityId),
      summary: entry.summary,
      product: entry.product,
      meta: metaOf(entry),
      ip,
      userAgent,
    })
  } catch (error) {
    console.error('[audit] failed to write entry', { action: entry.action, entity: entry.entity, orgId: String(ctx.orgId) }, error)
  }
}

/**
 * Audit row written by Flowbit staff (/platform) or a system job (webhook) into
 * a workspace's log: `platform: true`, actor name 'Flowbit support' unless given.
 */
export async function auditAsPlatform(
  orgId: Types.ObjectId,
  actor: { userId?: Types.ObjectId | null; name?: string },
  entry: AuditEntry,
): Promise<void> {
  try {
    const [ip, userAgent] = await Promise.all([requestIp(), requestUserAgent()])
    await AuditLog.create({
      orgId,
      actorId: actor.userId ?? undefined,
      actorName: actor.name ?? 'Flowbit support',
      actorRole: 'Flowbit',
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId == null ? undefined : String(entry.entityId),
      summary: entry.summary,
      product: entry.product,
      meta: metaOf(entry),
      ip,
      userAgent,
      platform: true,
    })
  } catch (error) {
    console.error('[audit] failed to write platform entry', { action: entry.action, orgId: String(orgId) }, error)
  }
}
