import 'server-only'
import type { Ctx } from '@/lib/ctx'
import { ImportBatch } from '@/models/imports/ImportBatch'
import { OAuthGrant } from '@/models/mcp/OAuthGrant'
import { User } from '@/models/User'
import { undoRefusal } from '@/modules/imports/batch'
import { SCOPE_DEFS, parseScopes } from './scopes'

/** Rows for Settings → Connected apps. Admins see the whole workspace; everyone else their own. */

export type GrantRow = Readonly<{ id: string; clientName: string; by: string; mine: boolean; scopes: string[]; connectedAt: string; lastUsedAt: string | null; revokedAt: string | null }>
export type BatchRow = Readonly<{ id: string; label: string; by: string; at: string; status: 'done' | 'undone'; changes: number; failed: number; canUndo: boolean; lines: { summary: string; status: string; link?: string | null; error?: string | null }[] }>

export async function connectedApps(ctx: Ctx): Promise<GrantRow[]> {
  const all = ctx.can('org.manage')
  const rows = await ctx.db(OAuthGrant).find(all ? {} : { userId: ctx.userId }, { clientName: 1, userId: 1, scopes: 1, createdAt: 1, lastUsedAt: 1, revokedAt: 1 }).sort({ revokedAt: 1, createdAt: -1 }).limit(100).lean()
  const users = await User.find({ _id: { $in: rows.map((r) => r.userId) } }, { name: 1 }).lean()
  const names = new Map(users.map((u) => [String(u._id), u.name]))
  return rows.map((g) => ({
    id: String(g._id),
    clientName: g.clientName,
    by: names.get(String(g.userId)) ?? 'Former member',
    mine: String(g.userId) === String(ctx.userId),
    scopes: parseScopes(g.scopes).map((s) => SCOPE_DEFS[s].label),
    connectedAt: g.createdAt.toISOString(),
    lastUsedAt: g.lastUsedAt?.toISOString() ?? null,
    revokedAt: g.revokedAt?.toISOString() ?? null,
  }))
}

export async function mcpHistory(ctx: Ctx): Promise<BatchRow[]> {
  const all = ctx.can('org.manage')
  const rows = await ctx.db(ImportBatch).find({ kind: 'mcp', ...(all ? {} : { actorUserId: ctx.userId }) }).sort({ createdAt: -1 }).limit(50).lean()
  const now = new Date()
  return rows.map((b) => ({
    id: String(b._id),
    label: b.label,
    by: b.actorName,
    at: b.createdAt.toISOString(),
    status: b.status === 'undone' ? 'undone' : 'done',
    changes: b.imported ?? 0,
    failed: (b.lines ?? []).filter((l) => l.status === 'failed').length,
    canUndo: b.status === 'done' && !undoRefusal(b, now),
    lines: (b.lines ?? []).map((l) => ({ summary: l.summary ?? '', status: l.status ?? '', link: l.link ?? null, error: l.error ?? null })),
  }))
}
