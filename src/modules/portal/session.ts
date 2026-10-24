import 'server-only'
import { cache } from 'react'
import type { Model } from 'mongoose'
import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { hasAddOn } from '@/lib/addons'
import { hashToken, randomToken } from '@/lib/auth/tokens'
import { dbConnect } from '@/lib/db'
import { scoped, type Scoped } from '@/lib/db/scoped'
import { emailBrandFor } from '@/lib/email-brand'
import { secureCookies, serverEnv } from '@/lib/env'
import { emailLayout, sendMail } from '@/lib/mail'
import { checkOtp, generateOtp, hashOtp, OTP_MAX_ATTEMPTS, OTP_TTL_SECONDS } from '@/lib/otp'
import { rateLimit, RATE_LIMITS, rateLimitMessage } from '@/lib/rate-limit'
import { requestIp } from '@/lib/request'
import { Client } from '@/models/Client'
import { Org } from '@/models/Org'
import { PortalCode } from '@/models/portal/PortalCode'
import { PortalContact } from '@/models/portal/PortalContact'
import { PortalSession } from '@/models/portal/PortalSession'
import { PORTAL_CODE_REFUSAL, PORTAL_COOKIE, PORTAL_COOKIE_PATH, PORTAL_SESSION_SECONDS, portalRefusal } from './access'

/**
 * Client portal sign-in: a six-digit code by email (lib/otp), then a portal
 * session in its own collection and cookie (`fb_portal`, host-only, path
 * /portal). Codes are HMACs, five guesses each, rate-limited per email and IP.
 */

const SLUG = /^[a-z0-9-]{2,60}$/

export const portalPath = (slug: string, path = '') => `/portal/${slug}${path}`

export type PortalOrg = NonNullable<Awaited<ReturnType<typeof loadOrg>>>
const loadOrg = (slug: string) => Org.findOne({ slug, deletedAt: null }, { name: 1, slug: 1, subscription: 1, enabledProducts: 1, workspaceKind: 1, disabled: 1, deletedAt: 1, createdAt: 1, status: 1, theme: 1, logoFileId: 1 }).lean()

/** The workspace behind a portal URL, with whether its portal is on (Suite, add-on, trial). Null for a bad slug. */
export async function portalOrg(slug: string): Promise<{ org: PortalOrg; portalOn: boolean } | null> {
  if (!SLUG.test(slug)) return null
  await dbConnect()
  const org = await loadOrg(slug)
  return org ? { org, portalOn: hasAddOn(org, 'portal') } : null
}

async function limited(scope: 'portalCodeSend' | 'portalCodeVerify', key: string): Promise<string | null> {
  const { limit, windowMs } = RATE_LIMITS[scope]
  const result = await rateLimit(`${scope}:${key}`, limit, windowMs)
  return result.ok ? null : rateLimitMessage(result.retryAfterSeconds)
}

const SENT = 'If that email has access to this portal, a code is on its way. It lasts 10 minutes.'

/** Emails a code to an invited, active contact. The answer is the same for any email (no account probing). */
export async function requestPortalCode(slug: string, rawEmail: string): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const email = rawEmail.trim().toLowerCase()
  const refused = (await limited('portalCodeSend', `email:${slug}:${email}`)) ?? (await limited('portalCodeSend', `ip:${await requestIp()}`))
  if (refused) return { ok: false, error: refused }
  const found = await portalOrg(slug)
  if (!found) return { ok: true, message: SENT }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = <M extends Model<any>>(model: M) => scoped(model, found.org._id)
  const contact = await db(PortalContact).findOne({ email }).lean()
  const client = contact ? await db(Client).findById(contact.clientId, { name: 1, displayName: 1, portal: 1, status: 1 }).lean() : null
  if (portalRefusal({ portalOn: found.portalOn, deleted: false }, client ? { enabled: Boolean(client.portal?.enabled), status: client.status } : null, contact)) return { ok: true, message: SENT }
  const code = generateOtp()
  await db(PortalCode).updateMany({ contactId: contact!._id, consumedAt: null }, { $set: { consumedAt: new Date() } })
  await db(PortalCode).create({ contactId: contact!._id, codeHash: hashOtp(code, serverEnv().APP_SECRET), expiresAt: new Date(Date.now() + OTP_TTL_SECONDS * 1000) })
  const brand = await emailBrandFor(found.org._id)
  const mail = emailLayout({
    title: `Your code for ${found.org.name}`,
    workspace: found.org.name,
    brand,
    paragraphs: [`Hi ${contact!.name.split(' ')[0]}, use ${code} to open your client portal with ${found.org.name}. It lasts 10 minutes.`, 'If you did not ask for this, you can ignore this email.'],
  })
  await sendMail({ orgId: found.org._id, to: email, subject: `${code} is your ${found.org.name} portal code`, ...mail, kind: 'portal', entity: 'PortalContact', entityId: contact!._id, secrets: [code] })
  return { ok: true, message: SENT }
}

/** Checks a code and starts a portal session (sets the cookie). */
export async function verifyPortalCode(slug: string, rawEmail: string, code: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const email = rawEmail.trim().toLowerCase()
  const refused = await limited('portalCodeVerify', `${slug}:${email}`)
  if (refused) return { ok: false, error: refused }
  const found = await portalOrg(slug)
  // One answer for every refusal (no such contact, wrong, expired, used, too many guesses), so the sign-in never tells who is a contact.
  const refusal = { ok: false as const, error: PORTAL_CODE_REFUSAL }
  if (!found) return refusal
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = <M extends Model<any>>(model: M) => scoped(model, found.org._id)
  const contact = await db(PortalContact).findOne({ email }).lean()
  const client = contact ? await db(Client).findById(contact.clientId, { portal: 1, status: 1 }).lean() : null
  if (portalRefusal({ portalOn: found.portalOn, deleted: false }, client ? { enabled: Boolean(client.portal?.enabled), status: client.status } : null, contact)) return refusal
  const challenge = await db(PortalCode).findOne({ contactId: contact!._id }).sort({ createdAt: -1 }).lean()
  if (!challenge) return refusal
  // Take one of the five guesses atomically, so parallel guesses cannot go past the limit.
  const guess = await db(PortalCode).updateOne({ _id: challenge._id, consumedAt: null, attempts: { $lt: OTP_MAX_ATTEMPTS } }, { $inc: { attempts: 1 } })
  if (!guess.modifiedCount) return refusal
  if (checkOtp(challenge, code.trim(), serverEnv().APP_SECRET) !== 'ok') return refusal
  // Claim the code once, even when two requests race.
  const claimed = await db(PortalCode).updateOne({ _id: challenge._id, consumedAt: null }, { $set: { consumedAt: new Date() } })
  if (!claimed.modifiedCount) return refusal
  const token = randomToken()
  const ua = (await headers()).get('user-agent') ?? ''
  await db(PortalSession).create({ contactId: contact!._id, clientId: contact!.clientId, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + PORTAL_SESSION_SECONDS * 1000), lastSeenAt: new Date(), userAgent: ua.slice(0, 300) })
  await db(PortalContact).updateOne({ _id: contact!._id }, { $set: { lastSignInAt: new Date() } })
  // No Domain attribute: host-only. Path /portal: never sent to /app or the API.
  ;(await cookies()).set(PORTAL_COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: secureCookies(), path: PORTAL_COOKIE_PATH, maxAge: PORTAL_SESSION_SECONDS })
  return { ok: true }
}

export type PortalViewer = Readonly<{
  org: PortalOrg
  orgId: PortalOrg['_id']
  client: { _id: PortalOrg['_id']; name: string }
  contact: { _id: PortalOrg['_id']; name: string; email: string }
  sessionId: PortalOrg['_id']
  /** Queries scoped to the portal's workspace. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: <M extends Model<any>>(model: M) => Scoped<M>
}>

/** The signed-in contact for this portal URL, or null. A session from another workspace never opens it. Cached per request. */
export const getPortalViewer = cache(async (slug: string): Promise<PortalViewer | null> => {
  const token = (await cookies()).get(PORTAL_COOKIE)?.value
  if (!token) return null
  const found = await portalOrg(slug)
  if (!found || !found.portalOn) return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = <M extends Model<any>>(model: M) => scoped(model, found.org._id)
  const session = await db(PortalSession).findOne({ tokenHash: hashToken(token), expiresAt: { $gt: new Date() } }).lean()
  if (!session) return null
  const [contact, client] = await Promise.all([db(PortalContact).findById(session.contactId).lean(), db(Client).findById(session.clientId, { name: 1, displayName: 1, portal: 1, status: 1 }).lean()])
  if (portalRefusal({ portalOn: true, deleted: false }, client ? { enabled: Boolean(client.portal?.enabled), status: client.status } : null, contact)) return null
  if (String(contact!.clientId) !== String(client!._id)) return null
  return { org: found.org, orgId: found.org._id, client: { _id: client!._id, name: client!.displayName || client!.name }, contact: { _id: contact!._id, name: contact!.name, email: contact!.email }, sessionId: session._id, db }
})

/** The viewer, or the portal's sign-in page. */
export async function requirePortalViewer(slug: string): Promise<PortalViewer> {
  const viewer = await getPortalViewer(slug)
  if (!viewer) redirect(portalPath(slug, '/login'))
  return viewer
}

export async function endPortalSession(slug: string): Promise<void> {
  const jar = await cookies()
  const token = jar.get(PORTAL_COOKIE)?.value
  if (token) {
    const found = await portalOrg(slug)
    if (found) await scoped(PortalSession, found.org._id).deleteOne({ tokenHash: hashToken(token) })
  }
  jar.delete({ name: PORTAL_COOKIE, path: PORTAL_COOKIE_PATH })
}
