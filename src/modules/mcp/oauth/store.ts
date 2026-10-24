import 'server-only'
import { Types } from 'mongoose'
import { dbConnect } from '@/lib/db'
import { OAuthClient } from '@/models/mcp/OAuthClient'
import { OAuthCode } from '@/models/mcp/OAuthCode'
import { OAuthGrant } from '@/models/mcp/OAuthGrant'
import { OAuthRefreshToken } from '@/models/mcp/OAuthRefreshToken'
import { parseScopes } from '../scopes'
import type { ClientRecord, CodeRecord, GrantRecord, OAuthStore } from './core'

/**
 * The MongoDB OAuthStore. Token lookups are by SHA-256 across workspaces (a
 * bearer token is what tells us the workspace), so these queries are not
 * org-scoped; every grant row carries its orgId and the MCP session builds an
 * org-scoped ctx from it.
 */

const oid = (id: string) => new Types.ObjectId(id)

type ClientDoc = { clientId: string; clientName: string; redirectUris: string[]; authMethod: string; clientSecretHash?: string | null; createdAt: Date }
const toClient = (d: ClientDoc): ClientRecord => ({
  clientId: d.clientId,
  clientName: d.clientName,
  redirectUris: [...d.redirectUris],
  authMethod: d.authMethod as ClientRecord['authMethod'],
  clientSecretHash: d.clientSecretHash ?? null,
  createdAt: d.createdAt,
})

type CodeDoc = { codeHash: string; clientId: string; userId: unknown; orgId: unknown; memberId: unknown; scopes: string[]; redirectUri: string; codeChallenge: string; resource?: string | null; expiresAt: Date; usedAt?: Date | null; grantId?: unknown }
const toCode = (d: CodeDoc): CodeRecord => ({
  codeHash: d.codeHash,
  clientId: d.clientId,
  userId: String(d.userId),
  orgId: String(d.orgId),
  memberId: String(d.memberId),
  scopes: parseScopes(d.scopes),
  redirectUri: d.redirectUri,
  codeChallenge: d.codeChallenge,
  resource: d.resource ?? null,
  expiresAt: d.expiresAt,
  usedAt: d.usedAt ?? null,
  grantId: d.grantId ? String(d.grantId) : null,
})

type GrantDoc = Omit<GrantRecord, 'id' | 'orgId' | 'userId' | 'memberId' | 'scopes'> & { _id: unknown; orgId: unknown; userId: unknown; memberId: unknown; scopes: string[] }
export const toGrant = (d: GrantDoc): GrantRecord => ({
  id: String(d._id),
  orgId: String(d.orgId),
  userId: String(d.userId),
  memberId: String(d.memberId),
  clientId: d.clientId,
  clientName: d.clientName,
  scopes: parseScopes(d.scopes),
  resource: d.resource ?? null,
  accessHash: d.accessHash,
  accessExpiresAt: d.accessExpiresAt,
  refreshHash: d.refreshHash,
  refreshExpiresAt: d.refreshExpiresAt,
  previousRefreshHash: d.previousRefreshHash ?? null,
  codeHash: d.codeHash ?? null,
  revokedAt: d.revokedAt ?? null,
})

const findGrant = async (filter: Record<string, unknown>) => {
  await dbConnect()
  const doc = await OAuthGrant.findOne(filter).lean()
  return doc ? toGrant(doc as unknown as GrantDoc) : null
}

export const mongoOAuthStore: OAuthStore = {
  async findClient(clientId) {
    await dbConnect()
    const doc = await OAuthClient.findOne({ clientId }).lean()
    return doc ? toClient(doc as unknown as ClientDoc) : null
  },
  async insertClient(c) {
    await dbConnect()
    await OAuthClient.create({ ...c })
  },
  async insertCode(c) {
    await dbConnect()
    await OAuthCode.create({ ...c, orgId: oid(c.orgId), userId: oid(c.userId), memberId: oid(c.memberId), grantId: null })
  },
  async claimCode(codeHash, now) {
    await dbConnect()
    const claimed = await OAuthCode.findOneAndUpdate({ codeHash, usedAt: null }, { $set: { usedAt: now } }).lean()
    if (claimed) return { code: toCode(claimed as unknown as CodeDoc), firstUse: true }
    const used = await OAuthCode.findOne({ codeHash }).lean()
    return used ? { code: toCode(used as unknown as CodeDoc), firstUse: false } : null
  },
  async linkCodeToGrant(codeHash, grantId) {
    await OAuthCode.updateOne({ codeHash }, { $set: { grantId: oid(grantId) } })
  },
  async insertGrant(g) {
    await dbConnect()
    const doc = await OAuthGrant.create({ ...g, orgId: oid(g.orgId), userId: oid(g.userId), memberId: oid(g.memberId) })
    return String(doc._id)
  },
  findGrantByAccess: (accessHash) => findGrant({ accessHash }),
  findGrantByRefresh: (refreshHash) => findGrant({ refreshHash }),
  findGrantByPreviousRefresh: (previousRefreshHash) => findGrant({ previousRefreshHash }),
  async rotateGrant(id, expectRefreshHash, next) {
    await dbConnect()
    const res = await OAuthGrant.updateOne({ _id: oid(id), refreshHash: expectRefreshHash, revokedAt: null }, { $set: { ...next } })
    return res.modifiedCount === 1
  },
  async revokeGrant(id, now) {
    await dbConnect()
    await OAuthGrant.updateOne({ _id: oid(id), revokedAt: null }, { $set: { revokedAt: now } })
  },
  async revokeCodeFamily(codeHash, now) {
    await dbConnect()
    await OAuthCode.updateOne({ codeHash, replayedAt: null }, { $set: { replayedAt: now } })
    await OAuthGrant.updateMany({ codeHash, revokedAt: null }, { $set: { revokedAt: now, revokedBy: 'code_replay' } })
  },
  async codeReplayed(codeHash) {
    await dbConnect()
    return Boolean(await OAuthCode.exists({ codeHash, replayedAt: { $ne: null } }))
  },
  async rememberRefresh(grant, hash, expiresAt) {
    await dbConnect()
    await OAuthRefreshToken.create({ orgId: oid(grant.orgId), grantId: oid(grant.id), hash, expiresAt })
  },
  async findGrantIdByIssuedRefresh(hash) {
    await dbConnect()
    const row = await OAuthRefreshToken.findOne({ hash }, { grantId: 1 }).lean()
    return row ? String(row.grantId) : null
  },
}
