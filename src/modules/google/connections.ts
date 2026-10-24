import 'server-only'
import type { Types } from 'mongoose'
import { encryptionKey, isGoogleConfigured, serverEnv } from '@/lib/env'
import { openSecret, sealSecret } from '@/lib/secret-box'
import type { Scoped } from '@/lib/db/scoped'
import { GoogleConnection } from '@/models/integrations/GoogleConnection'
import { GoogleApiError, refreshAccessToken, revokeToken } from './client'
import type { GoogleService } from './scopes'

/** Stored Google connections: seal, open, refresh to an access token, mark broken, disconnect. */

type Db = { db: (model: typeof GoogleConnection) => Scoped<typeof GoogleConnection> }

/** Google OAuth client set, and a 32-byte APP_ENCRYPTION_KEY to seal tokens. */
export const googleIntegrationsReady = (): boolean => isGoogleConfigured() && encryptionKey() !== null

export type ConnectionInfo = Readonly<{ connected: boolean; broken: boolean; connectedAt: string | null; lastError: string | null }>

export async function connectionInfo(scope: Db, memberId: Types.ObjectId | string, service: GoogleService): Promise<ConnectionInfo> {
  const row = await scope.db(GoogleConnection).findOne({ memberId, service }, { connectedAt: 1, brokenAt: 1, lastError: 1 }).lean()
  return { connected: Boolean(row), broken: Boolean(row?.brokenAt), connectedAt: row?.connectedAt?.toISOString() ?? null, lastError: row?.lastError ?? null }
}

export async function saveConnection(scope: Db, input: { memberId: Types.ObjectId; userId: Types.ObjectId; service: GoogleService; refreshToken: string; scope: string }): Promise<void> {
  const key = encryptionKey()
  if (!key) throw new Error('APP_ENCRYPTION_KEY is not set')
  await scope.db(GoogleConnection).updateOne(
    { memberId: input.memberId, service: input.service },
    { $set: { userId: input.userId, refreshTokenSealed: sealSecret(input.refreshToken, key), scope: input.scope, connectedAt: new Date() }, $unset: { brokenAt: 1, lastError: 1 } },
    { upsert: true },
  )
}

const oauthClient = () => ({ clientId: serverEnv().GOOGLE_CLIENT_ID, clientSecret: serverEnv().GOOGLE_CLIENT_SECRET })

/**
 * A fresh access token for the member's connection, or null when there is
 * none, it is broken, or the server cannot open it. A revoked grant marks the
 * connection broken so Settings asks the member to connect again.
 */
export async function accessTokenFor(scope: Db, memberId: Types.ObjectId | string, service: GoogleService): Promise<string | null> {
  const key = encryptionKey()
  if (!key || !isGoogleConfigured()) return null
  const row = await scope.db(GoogleConnection).findOne({ memberId, service }).lean()
  if (!row || row.brokenAt) return null
  const refreshToken = openSecret(row.refreshTokenSealed, key)
  if (!refreshToken) return markBroken(scope, row._id, 'The stored token could not be opened. Connect again.')
  try {
    const token = await refreshAccessToken(oauthClient(), refreshToken)
    await scope.db(GoogleConnection).updateOne({ _id: row._id }, { $set: { lastUsedAt: new Date() } })
    return token.access_token
  } catch (error) {
    if (error instanceof GoogleApiError && error.needsReconnect) return markBroken(scope, row._id, 'Google no longer accepts this connection. Connect again.')
    throw error
  }
}

async function markBroken(scope: Db, id: unknown, message: string): Promise<null> {
  await scope.db(GoogleConnection).updateOne({ _id: id }, { $set: { brokenAt: new Date(), lastError: message } })
  return null
}

/** Revokes the grant at Google (best effort) and deletes the stored token. */
export async function disconnect(scope: Db, memberId: Types.ObjectId, service: GoogleService): Promise<boolean> {
  const row = await scope.db(GoogleConnection).findOne({ memberId, service }).lean()
  if (!row) return false
  const key = encryptionKey()
  const token = key ? openSecret(row.refreshTokenSealed, key) : null
  if (token) await revokeToken(token).catch((error: unknown) => console.warn('[google] revoke failed; deleting the token anyway', error instanceof Error ? error.message : error))
  await scope.db(GoogleConnection).deleteOne({ _id: row._id })
  return true
}
