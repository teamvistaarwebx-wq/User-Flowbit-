import type { ClientRecord, CodeRecord, GrantRecord, NewGrant, OAuthStore, TokenPair } from './core'

/** An in-memory OAuthStore for tests and the in-process protocol smoke test. Never used by the app. */
export function memoryOAuthStore(): OAuthStore & { grants: GrantRecord[]; codes: CodeRecord[]; clients: ClientRecord[]; issued: Map<string, string>; replayed: Set<string> } {
  const issued = new Map<string, string>()
  const replayed = new Set<string>()
  const clients: ClientRecord[] = []
  const codes: CodeRecord[] = []
  const grants: GrantRecord[] = []
  const replace = <T>(list: T[], i: number, next: T) => list.splice(i, 1, next)
  return {
    clients,
    codes,
    grants,
    issued,
    replayed,
    findClient: async (id) => clients.find((c) => c.clientId === id) ?? null,
    insertClient: async (c) => void clients.push(c),
    insertCode: async (c) => void codes.push(c),
    claimCode: async (hash, now) => {
      const i = codes.findIndex((c) => c.codeHash === hash)
      if (i < 0) return null
      const code = codes[i]
      if (code.usedAt) return { code, firstUse: false }
      replace(codes, i, { ...code, usedAt: now })
      return { code, firstUse: true }
    },
    linkCodeToGrant: async (hash, grantId) => {
      const i = codes.findIndex((c) => c.codeHash === hash)
      if (i >= 0) replace(codes, i, { ...codes[i], grantId })
    },
    insertGrant: async (g: NewGrant) => {
      const id = `g${grants.length + 1}`
      grants.push({ ...g, id })
      return id
    },
    findGrantByAccess: async (h) => grants.find((g) => g.accessHash === h) ?? null,
    findGrantByRefresh: async (h) => grants.find((g) => g.refreshHash === h) ?? null,
    findGrantByPreviousRefresh: async (h) => grants.find((g) => g.previousRefreshHash === h) ?? null,
    rotateGrant: async (id, expect, next: TokenPair) => {
      const i = grants.findIndex((g) => g.id === id && g.refreshHash === expect)
      if (i < 0) return false
      replace(grants, i, { ...grants[i], ...next })
      return true
    },
    revokeGrant: async (id, now) => {
      const i = grants.findIndex((g) => g.id === id)
      if (i >= 0) replace(grants, i, { ...grants[i], revokedAt: grants[i].revokedAt ?? now })
    },
    revokeCodeFamily: async (hash, now) => {
      replayed.add(hash)
      grants.forEach((g, i) => {
        if (g.codeHash === hash && !g.revokedAt) replace(grants, i, { ...g, revokedAt: now })
      })
    },
    codeReplayed: async (hash) => replayed.has(hash),
    rememberRefresh: async (grant, hash) => void issued.set(hash, grant.id),
    findGrantIdByIssuedRefresh: async (hash) => issued.get(hash) ?? null,
  }
}
