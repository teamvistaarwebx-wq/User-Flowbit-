import 'server-only'
import { cache } from 'react'
import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import type { Types } from 'mongoose'
import { dbConnect } from '@/lib/db'
import { secureCookies } from '@/lib/env'
import { recordUsage } from '@/lib/usage'
import { Session } from '@/models/Session'
import { OAuthGrant } from '@/models/mcp/OAuthGrant'
import { User } from '@/models/User'
import { SESSION_COOKIE, SESSION_MAX_AGE, sessionCookieOptions } from './cookies'
import { hashToken, randomToken } from './tokens'

/** Sliding expiry and Session.lastSeenAt are refreshed at most this often. */
const SLIDE_AFTER_MS = 5 * 60 * 1000

const isSecure = secureCookies

async function loadUser(userId: Types.ObjectId) {
  return User.findById(userId).lean()
}

export type SessionUser = NonNullable<Awaited<ReturnType<typeof loadUser>>>
export type SessionRecord = NonNullable<Awaited<ReturnType<typeof loadSession>>>

async function loadSession(tokenHash: string) {
  return Session.findOne({ tokenHash, expiresAt: { $gt: new Date() } }).lean()
}

/**
 * Starts a session for `userId` and sets the httpOnly `fb_session` cookie.
 * Call only from a server action or route handler.
 */
export async function createSession(userId: Types.ObjectId, activeOrgId?: Types.ObjectId | null): Promise<void> {
  await dbConnect()
  const token = randomToken()
  const ua = (await headers()).get('user-agent') ?? ''
  await Session.create({
    tokenHash: hashToken(token),
    userId,
    activeOrgId: activeOrgId ?? undefined,
    expiresAt: new Date(Date.now() + SESSION_MAX_AGE * 1000),
    userAgent: ua.slice(0, 300),
  })
  await User.updateOne({ _id: userId }, { $set: { lastLoginAt: new Date() } })
  ;(await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions(isSecure()))
  recordUsage({ kind: 'login', userId, orgId: activeOrgId })
}

/** Records that the person proved they read their inbox (signup code, Google, reset or invite link). Idempotent. */
export async function markEmailVerified(userId: Types.ObjectId): Promise<void> {
  await User.updateOne({ _id: userId, emailVerifiedAt: null }, { $set: { emailVerifiedAt: new Date() } })
}

/**
 * The live session behind the cookie, or null, without the user. Cached per
 * request. getCtx starts the workspace reads from it while the user loads.
 */
export const getSessionRecord = cache(async (): Promise<SessionRecord | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  if (!token) return null
  await dbConnect()
  return loadSession(hashToken(token))
})

/** The signed-in user and their session, or null. Cached per request. */
export const getSession = cache(async (): Promise<{ user: SessionUser; session: SessionRecord } | null> => {
  const session = await getSessionRecord()
  if (!session) return null
  // Sliding expiry and "last active": refreshed at most every 5 minutes, alongside the user read.
  const slide = Date.now() - new Date(session.lastSeenAt ?? 0).getTime() > SLIDE_AFTER_MS
  const [user] = await Promise.all([
    loadUser(session.userId),
    slide
      ? Session.updateOne({ _id: session._id }, { $set: { lastSeenAt: new Date(), expiresAt: new Date(Date.now() + SESSION_MAX_AGE * 1000) } })
      : null,
  ])
  if (!user) return null
  return { user, session }
})

/** The signed-in user, or a redirect to /login. */
export async function requireUser(): Promise<{ user: SessionUser; session: SessionRecord }> {
  const current = await getSession()
  if (!current) redirect('/login')
  return current
}

/** Ends the current session (sign out). */
export async function destroySession(): Promise<void> {
  const jar = await cookies()
  const token = jar.get(SESSION_COOKIE)?.value
  if (token) {
    await dbConnect()
    await Session.deleteOne({ tokenHash: hashToken(token) })
  }
  jar.delete(SESSION_COOKIE)
}

/** Switches the workspace the current session works in. */
export async function setActiveOrg(orgId: Types.ObjectId): Promise<void> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  if (!token) return
  await dbConnect()
  const session = await Session.findOneAndUpdate({ tokenHash: hashToken(token) }, { $set: { activeOrgId: orgId } })
  if (session) await User.updateOne({ _id: session.userId }, { $set: { lastOrgId: orgId } })
}

/** Ends every session of a user except, optionally, the current one (password change). */
export async function destroyOtherSessions(userId: Types.ObjectId, keepCurrent = true): Promise<void> {
  await dbConnect()
  const token = keepCurrent ? (await cookies()).get(SESSION_COOKIE)?.value : undefined
  await Session.deleteMany({ userId, ...(token ? { tokenHash: { $ne: hashToken(token) } } : {}) })
  // Connected AI apps hold their own tokens: ending the other sessions ends them too.
  await OAuthGrant.updateMany({ userId, revokedAt: null }, { $set: { revokedAt: new Date(), revokedBy: 'sign_out_everywhere' } })
}
