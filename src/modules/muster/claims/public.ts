import 'server-only'
import { cookies } from 'next/headers'
import type { Types } from 'mongoose'
import { scoped } from '@/lib/db/scoped'
import { secureCookies, serverEnv } from '@/lib/env'
import { elevated } from '@/lib/platform'
import { canWrite } from '@/lib/entitlements'
import { ClaimForm } from '@/models/muster/ClaimForm'
import { Employee } from '@/models/muster/Employee'
import { Org } from '@/models/Org'
import { isOnPayroll } from '@/modules/muster/people/lifecycle'
import { isEligibleFor, linkedClaimantProblem } from './rules'
import { getSession } from '@/lib/auth/session'
import { Member } from '@/models/Member'
import { CLAIM_COOKIE, CLAIM_SESSION_TTL_SECONDS, readClaimSession, signClaimSession } from './session'

/**
 * The public claim form runs without a Flowbit session. The form is found by
 * its globally unique slug (an elevated lookup, like a token); everything
 * after that is scoped to the form's workspace.
 */

export async function formBySlug(slug: string) {
  const clean = slug.trim().toLowerCase()
  if (!/^[a-z0-9-]{3,60}$/.test(clean)) return null
  return elevated('resolve a public claim form by its link', async (db) => {
    const form = await db.raw(ClaimForm).findOne({ slugLower: clean }).lean()
    if (!form) return null
    const org = await db.raw(Org).findById(form.orgId, { name: 1, logoFileId: 1, disabled: 1, deletedAt: 1, subscription: 1, enabledProducts: 1, workspaceKind: 1 }).lean()
    // A read-only, blocked or Muster-off workspace takes no writes from outside either.
    if (!org || !canWrite(org, 'muster')) return null
    return { form, org }
  })
}
export type PublicForm = NonNullable<Awaited<ReturnType<typeof formBySlug>>>

/** The org-scoped db handle for a public form (same wrapper as ctx.db). */
export const formDb = (orgId: Types.ObjectId) => <M extends Parameters<typeof scoped>[0]>(model: M) => scoped(model, orgId)

/** An employee who may claim on this form: on payroll, not deleted, and on the list when the form is for selected people. */
export async function eligibleEmployee(form: PublicForm['form'], email: string) {
  const db = formDb(form.orgId)
  const employee = await db(Employee).findOne({ workEmailLower: email.trim().toLowerCase(), deletedAt: null }, { fullName: 1, workEmail: 1, status: 1, memberId: 1 }).lean()
  if (!employee || !isOnPayroll(employee.status) || !isEligibleFor(form, String(employee._id))) return null
  return employee
}

const secret = () => serverEnv().APP_SECRET

export async function readSession(form: PublicForm['form']) {
  const store = await cookies()
  const session = readClaimSession(store.get(CLAIM_COOKIE)?.value, secret())
  if (!session || session.formId !== String(form._id) || session.orgId !== String(form.orgId)) return null
  return session
}

export async function startSession(form: PublicForm['form'], employeeId: string, email: string): Promise<void> {
  const store = await cookies()
  store.set(CLAIM_COOKIE, signClaimSession({ orgId: String(form.orgId), employeeId, formId: String(form._id), email }, secret()), {
    httpOnly: true,
    sameSite: 'lax',
    secure: secureCookies(),
    path: `/c/${form.slugLower}`,
    maxAge: CLAIM_SESSION_TTL_SECONDS,
  })
}

export async function endSession(form: PublicForm['form']): Promise<void> {
  const store = await cookies()
  store.set(CLAIM_COOKIE, '', { httpOnly: true, sameSite: 'lax', path: `/c/${form.slugLower}`, maxAge: 0 })
}

/** The signed-in Flowbit member's own employee record, when they may claim on this form without an email code. */
export async function linkedClaimant(form: PublicForm['form']): Promise<{ employeeId: string; name: string; email: string } | null> {
  const session = await getSession().catch(() => null)
  if (!session) return null
  const db = formDb(form.orgId)
  const member = await db(Member).findOne({ userId: session.user._id, status: 'active', employeeId: { $ne: null } }, { employeeId: 1 }).lean()
  if (!member?.employeeId) return null
  const employee = await db(Employee).findById(member.employeeId, { fullName: 1, workEmail: 1, status: 1, deletedAt: 1 }).lean()
  if (!employee || linkedClaimantProblem(employee, form, isOnPayroll)) return null
  return { employeeId: String(employee._id), name: employee.fullName, email: employee.workEmail ?? '' }
}
