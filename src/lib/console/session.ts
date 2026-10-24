import 'server-only'
import { cache } from 'react'
import { cookies, headers } from 'next/headers'
import { notFound, redirect, unstable_rethrow } from 'next/navigation'
import type { Types } from 'mongoose'
import type { z } from 'zod'
import type { ActionResult } from '@/lib/action-types'
import { actionInput, fail, fieldErrorsFrom, toResultError } from '@/lib/actions'
import { auditAsPlatform } from '@/lib/audit'
import { hashToken, randomToken } from '@/lib/auth/tokens'
import { dbConnect } from '@/lib/db'
import { secureCookies } from '@/lib/env'
import { systemDb, type SystemDb } from '@/lib/platform'
import { requestIp, requestUserAgent } from '@/lib/request'
import { Staff } from '@/models/console/Staff'
import { StaffAudit } from '@/models/console/StaffAudit'
import { StaffSession } from '@/models/console/StaffSession'
import { readStaffCookie, STAFF_MFA_MINUTES, STAFF_SESSION_MAX_AGE, staffCookieName, staffCookieOptions } from './cookies'
import { isStaffRole, STAFF_ROLE_LABEL, staffCan, type ConsolePerm, type StaffRole } from './roles'

/**
 * Console staff sessions (console spec 7): own cookie, own collection, 2FA.
 * Nothing here reads `fb_session`, so a customer session can never open the
 * Console, and product code never reads the staff cookie.
 */

export type StaffIdentity = { id: Types.ObjectId; name: string; email: string; role: StaffRole; isFounder: boolean }

export type ConsoleAuditEntry = { action: string; summary: string; orgId?: Types.ObjectId | null; entity?: string; entityId?: unknown; meta?: Record<string, unknown> }

export type StaffCtx = SystemDb & {
  staff: StaffIdentity
  can: (perm: ConsolePerm) => boolean
  /** Per-staff audit row (StaffAudit) and, with orgId, a row in the workspace's own log naming the staff member. */
  audit: (entry: ConsoleAuditEntry) => Promise<void>
}

const jar = async () => cookies()

/** Starts a session after the password step ('mfa') and sets the host-only cookie. */
export async function createStaffSession(staffId: Types.ObjectId): Promise<void> {
  await dbConnect()
  const token = randomToken()
  const [ip, ua] = await Promise.all([requestIp(), (await headers()).get('user-agent') ?? ''])
  await StaffSession.create({ tokenHash: hashToken(token), staffId, stage: 'mfa', expiresAt: new Date(Date.now() + STAFF_MFA_MINUTES * 60_000), ip, userAgent: ua.slice(0, 300) })
  const secure = secureCookies()
  ;(await jar()).set(staffCookieName(secure), token, staffCookieOptions(secure, STAFF_MFA_MINUTES * 60))
}

async function currentToken(): Promise<string | undefined> {
  const store = await jar()
  return readStaffCookie((name) => store.get(name)?.value)
}

export type StaffSessionState = { session: NonNullable<Awaited<ReturnType<typeof loadSession>>>; staff: NonNullable<Awaited<ReturnType<typeof loadStaff>>> }

const loadSession = (tokenHash: string) => StaffSession.findOne({ tokenHash, expiresAt: { $gt: new Date() } }).lean()
const loadStaff = (id: Types.ObjectId) => Staff.findOne({ _id: id, status: 'active' }).lean()

/** The staff session of this request (either stage), or null. Cached per request. */
export const getStaffSession = cache(async (): Promise<StaffSessionState | null> => {
  const token = await currentToken()
  if (!token) return null
  await dbConnect()
  const session = await loadSession(hashToken(token))
  if (!session) return null
  const staff = await loadStaff(session.staffId)
  if (!staff || !isStaffRole(staff.role)) return null
  return { session, staff }
})

/** Moves the session past 2FA: full lifetime, cookie re-set. Rotates the token so the pre-2FA cookie is useless. */
export async function completeStaffSession(sessionId: Types.ObjectId, staffId: Types.ObjectId): Promise<void> {
  const token = randomToken()
  await StaffSession.updateOne({ _id: sessionId }, { $set: { tokenHash: hashToken(token), stage: 'full', expiresAt: new Date(Date.now() + STAFF_SESSION_MAX_AGE * 1000) }, $unset: { pendingTotpSealed: 1 } })
  await Staff.updateOne({ _id: staffId }, { $set: { lastLoginAt: new Date() } })
  const secure = secureCookies()
  ;(await jar()).set(staffCookieName(secure), token, staffCookieOptions(secure))
}

export async function destroyStaffSession(): Promise<void> {
  const token = await currentToken()
  if (token) {
    await dbConnect()
    await StaffSession.deleteOne({ tokenHash: hashToken(token) })
  }
  const store = await jar()
  store.delete(staffCookieName(true))
  store.delete(staffCookieName(false))
}

export const staffIdentity = (staff: StaffSessionState['staff']): StaffIdentity => ({ id: staff._id, name: staff.name, email: staff.email, role: staff.role as StaffRole, isFounder: Boolean(staff.isFounder) })

/** Writes the per-staff row and, for a workspace, a row in its audit log as "Asha (Flowbit Sales)". */
export async function writeStaffAudit(staff: StaffIdentity, entry: ConsoleAuditEntry): Promise<void> {
  try {
    const [ip, userAgent] = await Promise.all([requestIp(), requestUserAgent()])
    await StaffAudit.create({ staffId: staff.id, staffName: staff.name, staffRole: staff.role, action: entry.action, summary: entry.summary, orgId: entry.orgId ?? undefined, meta: entry.meta, ip, userAgent })
  } catch (error) {
    console.error('[console] staff audit failed', { action: entry.action }, error)
  }
  if (!entry.orgId) return
  await auditAsPlatform(entry.orgId, { name: `${staff.name} (Flowbit ${STAFF_ROLE_LABEL[staff.role]})` }, { action: entry.action, entity: entry.entity ?? 'Org', entityId: entry.entityId ?? entry.orgId, summary: entry.summary, meta: entry.meta })
}

export function staffCtxOf(staff: StaffIdentity): StaffCtx {
  return { ...systemDb, staff, can: (perm) => staffCan(staff.role, perm), audit: (entry) => writeStaffAudit(staff, entry) }
}

/** The signed-in staff context (past 2FA), or null. */
export async function getStaffCtx(): Promise<StaffCtx | null> {
  const state = await getStaffSession()
  if (!state || state.session.stage !== 'full') return null
  return staffCtxOf(staffIdentity(state.staff))
}

/**
 * For Console pages: signed out -> /console/login; password done but no code
 * yet -> the 2FA step; missing permission -> 404 (the page is not revealed).
 */
export async function requireStaff(perm?: ConsolePerm): Promise<StaffCtx> {
  const state = await getStaffSession()
  if (!state) redirect('/console/login')
  if (state.session.stage !== 'full') redirect(state.staff.totp?.enabledAt ? '/console/login/verify' : '/console/login/enrol')
  const ctx = staffCtxOf(staffIdentity(state.staff))
  if (perm && !ctx.can(perm)) notFound()
  return ctx
}

/**
 * Server action for the Console: checks the staff session and the role's
 * permission on the server, parses FormData or an object with `schema`, and
 * turns known errors into `{ ok: false }`.
 */
export function consoleAction<S extends z.ZodType, O = void>(
  perm: ConsolePerm,
  schema: S,
  fn: (input: z.output<S>, ctx: StaffCtx) => Promise<ActionResult<O>>,
): (input: FormData | z.input<S>) => Promise<ActionResult<O>> {
  return async (input) => {
    try {
      const ctx = await getStaffCtx()
      if (!ctx) return fail('Your Console session has ended. Sign in again.')
      if (!ctx.can(perm)) return fail(`Your role (${STAFF_ROLE_LABEL[ctx.staff.role]}) cannot do that.`)
      const parsed = schema.safeParse(actionInput(input))
      if (!parsed.success) return fail('Some fields need attention.', fieldErrorsFrom(parsed.error))
      return await fn(parsed.data, ctx)
    } catch (error) {
      unstable_rethrow(error)
      return toResultError(error, fn.name || 'console')
    }
  }
}
