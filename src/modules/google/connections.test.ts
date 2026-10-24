import { randomBytes } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
const key = randomBytes(32)
vi.mock('@/lib/env', () => ({ encryptionKey: () => key, isGoogleConfigured: () => true, serverEnv: () => ({ GOOGLE_CLIENT_ID: 'c', GOOGLE_CLIENT_SECRET: 's' }) }))
const refreshAccessToken = vi.fn()
const revokeToken = vi.fn()
vi.mock('./client', async () => {
  const actual = await vi.importActual<typeof import('./client')>('./client')
  return { GoogleApiError: actual.GoogleApiError, refreshAccessToken: (...a: unknown[]) => refreshAccessToken(...a), revokeToken: (...a: unknown[]) => revokeToken(...a) }
})
vi.mock('@/models/integrations/GoogleConnection', () => ({ GoogleConnection: {} }))

type Row = Record<string, unknown> & { _id: string }
function fakeScope() {
  const rows: Row[] = []
  const match = (r: Row, f: Record<string, unknown>) => Object.entries(f).every(([k, v]) => String(r[k]) === String(v))
  const model = {
    findOne: (f: Record<string, unknown>) => ({ lean: async () => rows.find((r) => match(r, f)) ?? null }),
    updateOne: async (f: Record<string, unknown>, u: { $set?: Record<string, unknown>; $unset?: Record<string, unknown> }, o?: { upsert?: boolean }) => {
      let row = rows.find((r) => match(r, f))
      if (!row && o?.upsert) rows.push((row = { _id: `id${rows.length}`, ...f }))
      if (!row) return
      Object.assign(row, u.$set)
      for (const k of Object.keys(u.$unset ?? {})) delete row[k]
    },
    deleteOne: async (f: Record<string, unknown>) => {
      const i = rows.findIndex((r) => match(r, f))
      if (i >= 0) rows.splice(i, 1)
    },
  }
  return { rows, scope: { db: () => model } as never }
}

describe('Google connections', () => {
  beforeEach(() => {
    refreshAccessToken.mockReset()
    revokeToken.mockReset()
  })

  it('stores the refresh token sealed, never in plain text, and refreshes it to an access token', async () => {
    const { saveConnection, accessTokenFor } = await import('./connections')
    const { rows, scope } = fakeScope()
    await saveConnection(scope, { memberId: 'm1' as never, userId: 'u1' as never, service: 'calendar', refreshToken: 'refresh-secret', scope: 'x' })
    expect(JSON.stringify(rows)).not.toContain('refresh-secret')
    expect(String(rows[0].refreshTokenSealed)).toMatch(/^v1\./)
    refreshAccessToken.mockResolvedValue({ access_token: 'access-1' })
    await expect(accessTokenFor(scope, 'm1', 'calendar')).resolves.toBe('access-1')
    expect(refreshAccessToken).toHaveBeenCalledWith({ clientId: 'c', clientSecret: 's' }, 'refresh-secret')
  })

  it('marks the connection broken when Google revokes it', async () => {
    const { saveConnection, accessTokenFor } = await import('./connections')
    const { GoogleApiError } = await import('./client')
    const { rows, scope } = fakeScope()
    await saveConnection(scope, { memberId: 'm1' as never, userId: 'u1' as never, service: 'gmail', refreshToken: 'rt', scope: 'x' })
    refreshAccessToken.mockRejectedValue(new GoogleApiError('revoked', 400, 'invalid_grant'))
    await expect(accessTokenFor(scope, 'm1', 'gmail')).resolves.toBeNull()
    expect(rows[0].brokenAt).toBeInstanceOf(Date)
    await expect(accessTokenFor(scope, 'm1', 'gmail')).resolves.toBeNull()
    expect(refreshAccessToken).toHaveBeenCalledTimes(1)
  })

  it('revokes at Google and deletes on disconnect, even if the revoke fails', async () => {
    const { saveConnection, disconnect } = await import('./connections')
    const { rows, scope } = fakeScope()
    await saveConnection(scope, { memberId: 'm1' as never, userId: 'u1' as never, service: 'calendar', refreshToken: 'rt', scope: 'x' })
    revokeToken.mockRejectedValue(new Error('offline'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(disconnect(scope, 'm1' as never, 'calendar')).resolves.toBe(true)
    warn.mockRestore()
    expect(revokeToken).toHaveBeenCalledWith('rt')
    expect(rows).toHaveLength(0)
    await expect(disconnect(scope, 'm1' as never, 'calendar')).resolves.toBe(false)
  })
})
