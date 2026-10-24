'use server'

import { revalidatePath } from 'next/cache'
import type { Types } from 'mongoose'
import { z } from 'zod'
import { action, fail, ok } from '@/lib/actions'
import { audit } from '@/lib/audit'
import { createInvite } from '@/lib/auth/invites'
import type { Ctx } from '@/lib/ctx'
import { formatDate } from '@/lib/dates'
import { NotFoundError, UserError } from '@/lib/errors'
import { isoDate, objectId, optionalText } from '@/lib/validation'
import { Member } from '@/models/Member'
import { User } from '@/models/User'
import { Employee } from '@/models/muster/Employee'
import { OWN_RECORD_REFUSAL } from '@/modules/muster/leave/approvals'
import { assertCanGrant, customRolesOf, describeRole } from '@/modules/settings/role-access'
import { assertCapacity } from '@/modules/subscription/usage'
import { EMPLOYEE_STATUSES, isOnPayroll, statusLabelOf, transitionProblems, workModeOf } from './lifecycle'
import { auditOnboardingOverride, checkOnboardingGate } from './onboarding-gate'
import { assertBiometricIdFree } from '../attendance/biometric/save-mapping'
import { assertUnique, employeeFields, nextEmployeeCode, resolveRefs } from './save'
import { auditWorkModeChange } from './work-mode'
import { linkByWorkEmail, linkChosen, linkRecords } from './login-links'
import { assertVisible, mayDecideOwn, mayManageLogins, ownEmployeeId } from './scope'
import { employeeSchema } from './validation'

const PEOPLE = '/app/hr/people'
const OPTS = { product: 'muster', perm: 'people.write' } as const

/** Links the employee to an existing member whose login email matches, when there is exactly one. */
async function autoLink(ctx: Ctx, employeeId: Types.ObjectId): Promise<string | null> {
  const [name] = await linkByWorkEmail(ctx, [employeeId])
  return name ?? null
}

/** A move onto payroll (e.g. reactivating someone who left) takes a Muster employee slot. */
const joinsPayroll = (from: string, to: string) => !isOnPayroll(from) && isOnPayroll(to)

/** Capacity for one existing employee moving onto payroll; one with an active login is already counted as a person. */
async function assertPayrollSlot(ctx: Ctx, memberId: Types.ObjectId | null | undefined) {
  const hasLogin = memberId ? Boolean(await ctx.db(Member).exists({ _id: memberId, status: 'active' })) : false
  await assertCapacity(ctx, { addEmployees: 1, addEmployeesWithLogin: hasLogin ? 1 : 0 })
}

const LOGIN_ACCESS_REFUSAL = 'Linking a Flowbit login to an employee record needs access to sensitive details or member management. Ask an HR admin or workspace admin.'

/** Link, unlink and invite move a record's self-service to a login, so they are refused for one's own record or login. */
function assertMayChangeLogin(ctx: Ctx, employeeId: string, memberIds: (string | null | undefined)[]): void {
  if (!mayManageLogins(ctx)) throw new UserError(LOGIN_ACCESS_REFUSAL)
  if (mayDecideOwn(ctx)) return
  if (employeeId === ownEmployeeId(ctx) || memberIds.some((id) => id && id === String(ctx.memberId))) throw new UserError(OWN_RECORD_REFUSAL)
}

/** Fields that move pay, deductions, approval routing or the location check; someone else has to change them on one's own record. */
const OWN_LOCKED_FIELDS = ['managerId', 'departmentId', 'joinDate', 'originalJoiningDate', 'employmentType', 'isOvertimeEligible', 'statutory', 'workMode'] as const

/** Compares a new field value with the stored one (ObjectIds as strings, nested objects by the new value's keys). */
function sameValue(next: unknown, prev: unknown): boolean {
  if (next && typeof next === 'object' && !Array.isArray(next)) {
    const stored = (prev ?? {}) as Record<string, unknown>
    return Object.entries(next).every(([key, value]) => sameValue(value, stored[key]))
  }
  if (typeof next === 'boolean') return next === Boolean(prev)
  return String(next ?? '') === String(prev ?? '')
}

export const createEmployee = action(
  employeeSchema,
  async (input, ctx) => {
    const workEmailLower = input.workEmail.toLowerCase()
    const { designation } = await resolveRefs(ctx, input)
    const overridden = await checkOnboardingGate(ctx, { name: input.fullName, from: null, to: input.status, overrideReason: input.onboardingOverride })
    if (isOnPayroll(input.status)) await assertCapacity(ctx, { addEmployees: 1 })
    // The next code is taken only once every other check has passed, so a refused add does not use one up.
    const code = input.code || (await nextEmployeeCode(ctx))
    await assertUnique(ctx, code, workEmailLower)
    if (input.biometricId) await assertBiometricIdFree(ctx, input.biometricId)
    const doc = await ctx.db(Employee).create({ code, ...employeeFields(ctx, input, designation) })
    if (overridden) await auditOnboardingOverride(ctx, doc, input.status, overridden, input.onboardingOverride ?? '')
    const linkedTo = await autoLink(ctx, doc._id)
    await audit(ctx, { action: 'employee.created', entity: 'Employee', entityId: doc._id, summary: `Added ${doc.fullName} (${code})`, product: 'muster', changes: { after: doc.toObject(), redactIds: true } })
    revalidatePath(PEOPLE)
    const linked = linkedTo ? ` Linked to their Flowbit login.` : ''
    return ok(`${doc.fullName} added.${linked}`, { id: String(doc._id) }, `${PEOPLE}/${doc._id}`)
  },
  OPTS,
)

const staleRecord = (name: string) => `${name}'s record was changed by someone else after you opened this form. Reload the page to see the latest details, then make your change again.`

export const updateEmployee = action(
  employeeSchema.and(z.object({ id: objectId, version: z.string().max(40).optional() })),
  async (input, ctx) => {
    await assertVisible(ctx, input.id)
    const before = await ctx.db(Employee).findById(input.id).lean()
    if (!before) throw new NotFoundError('That employee')
    // The form posts every field, so saving over a newer version would silently undo someone else's change.
    const version = before.updatedAt ? new Date(before.updatedAt).toISOString() : null
    if (input.version && version && input.version !== version) return fail(staleRecord(before.fullName))
    const own = ownEmployeeId(ctx) === input.id && !mayDecideOwn(ctx)
    if (own && (input.status !== before.status || (input.exitDate ?? null) !== (before.exitDate ?? null))) {
      return fail('This is about your own record, so someone else has to change your status or exit date.', { status: 'Someone else has to change this.' })
    }
    // Payslips, letters and claim codes go to the work email, so changing it is as sensitive as linking a login.
    if (input.workEmail.toLowerCase() !== before.workEmailLower && !ctx.canAny('people.read_sensitive', 'members.manage')) {
      return fail('Changing a work email needs access to sensitive details or member management. Ask an HR admin.', { workEmail: 'Ask an HR admin to change this.' })
    }
    const problems = transitionProblems({ from: before.status, to: input.status, exitDate: input.exitDate, resignationDate: input.resignationDate, reason: input.exitReason ?? before.exitReason ?? undefined })
    if (problems) return fail(Object.values(problems)[0], problems.reason ? { ...problems, exitReason: problems.reason } : problems)
    const code = input.code || before.code
    await assertUnique(ctx, code, input.workEmail.toLowerCase(), input.id)
    if (input.biometricId) await assertBiometricIdFree(ctx, input.biometricId, input.id)
    const { designation } = await resolveRefs(ctx, input, input.id)
    const overridden = await checkOnboardingGate(ctx, { employeeId: before._id, name: before.fullName, from: before.status, to: input.status, overrideReason: input.onboardingOverride })
    if (joinsPayroll(before.status, input.status)) await assertPayrollSlot(ctx, before.memberId)
    const fields: Record<string, unknown> = employeeFields(ctx, input, designation)
    // An unset work mode is office, so saving "office" over it is no change.
    const stored = { ...before, workMode: workModeOf(before.workMode) } as Record<string, unknown>
    if (own && OWN_LOCKED_FIELDS.some((key) => key in fields && !sameValue(fields[key], stored[key]))) {
      return fail('This is about your own record, so someone else has to change your manager, department, joining date, employment type, work mode or statutory settings.')
    }
    const after = await ctx.db(Employee).findOneAndUpdate({ _id: input.id, ...(before.updatedAt ? { updatedAt: before.updatedAt } : {}) }, { $set: { code, ...fields } }).lean()
    if (!after) return fail(staleRecord(before.fullName))
    await audit(ctx, { action: 'employee.updated', entity: 'Employee', entityId: input.id, summary: `Changes saved for ${after.fullName}`, product: 'muster', changes: { before, after, redactIds: true } })
    if (overridden) await auditOnboardingOverride(ctx, after, after.status, overridden, input.onboardingOverride ?? '')
    if (input.workMode && input.workMode !== workModeOf(before.workMode)) await auditWorkModeChange(ctx, before, input.workMode)
    if (before.status !== after.status) {
      await audit(ctx, { action: 'employee.status_changed', entity: 'Employee', entityId: input.id, summary: `${after.fullName}: ${statusLabelOf(before.status)} → ${statusLabelOf(after.status)}`, product: 'muster', meta: { from: before.status, to: after.status, reason: input.exitReason } })
    }
    revalidatePath(`${PEOPLE}/${input.id}`)
    return ok(`Changes saved for ${after.fullName}.`, undefined, `${PEOPLE}/${input.id}`)
  },
  OPTS,
)

const statusSchema = z.object({
  id: objectId,
  status: z.enum(EMPLOYEE_STATUSES, { error: 'Choose a status' }),
  exitDate: isoDate.optional(),
  resignationDate: isoDate.optional(),
  reason: z.string().trim().max(500).optional(),
  onboardingOverride: optionalText(300),
})

/** Lifecycle move from the profile (confirm, notice, exit, reactivate) with a reason, audited. */
export const changeEmployeeStatus = action(
  statusSchema,
  async (input, ctx) => {
    await assertVisible(ctx, input.id)
    if (ownEmployeeId(ctx) === input.id && !mayDecideOwn(ctx)) return fail('This is about your own record, so someone else has to make this decision.')
    const before = await ctx.db(Employee).findById(input.id).lean()
    if (!before) throw new NotFoundError('That employee')
    if (before.status === input.status) return fail(`${before.fullName} is already ${statusLabelOf(input.status)}.`, { status: 'Pick a different status.' })
    const problems = transitionProblems({ from: before.status, to: input.status, exitDate: input.exitDate, resignationDate: input.resignationDate, reason: input.reason })
    if (problems) return fail(Object.values(problems)[0], problems)
    if (input.exitDate && input.exitDate < before.joinDate) return fail('The last working day cannot be before the joining date.', { exitDate: 'Before the joining date.' })
    const overridden = await checkOnboardingGate(ctx, { employeeId: before._id, name: before.fullName, from: before.status, to: input.status, overrideReason: input.onboardingOverride })
    if (joinsPayroll(before.status, input.status)) await assertPayrollSlot(ctx, before.memberId)
    const set: Record<string, unknown> = { status: input.status }
    if (input.exitDate) Object.assign(set, { exitDate: input.exitDate, exitReason: input.reason })
    if (input.resignationDate) set.resignationDate = input.resignationDate
    if (['active', 'confirmed', 'probation'].includes(input.status) && before.exitDate) Object.assign(set, { exitDate: null, exitReason: null })
    await ctx.db(Employee).updateOne({ _id: input.id }, { $set: set })
    if (overridden) await auditOnboardingOverride(ctx, before, input.status, overridden, input.onboardingOverride ?? '')
    await audit(ctx, {
      action: input.exitDate ? 'employee.exited' : 'employee.status_changed',
      entity: 'Employee',
      entityId: input.id,
      summary: `${before.fullName}: ${statusLabelOf(before.status)} → ${statusLabelOf(input.status)}${input.exitDate ? `, last working day ${formatDate(input.exitDate)}` : ''}`,
      product: 'muster',
      meta: { from: before.status, to: input.status, reason: input.reason, exitDate: input.exitDate, resignationDate: input.resignationDate },
    })
    revalidatePath(`${PEOPLE}/${input.id}`)
    revalidatePath(PEOPLE)
    const message = input.exitDate
      ? `${before.fullName} removed from the directory. Their record and history are kept.`
      : `${before.fullName} is now ${statusLabelOf(input.status)}.`
    return ok(message, undefined, input.exitDate ? PEOPLE : undefined)
  },
  OPTS,
)

/** Connects an employee record to an existing member (self-service, check-in, approvals). */
export const linkEmployeeMember = action(
  z.object({ id: objectId, memberId: objectId }),
  async ({ id, memberId }, ctx) => {
    await assertVisible(ctx, id)
    const [employee, member] = await Promise.all([ctx.db(Employee).findById(id).lean(), ctx.db(Member).findById(memberId).lean()])
    if (!employee) throw new NotFoundError('That employee')
    if (!member) throw new NotFoundError('That member')
    assertMayChangeLogin(ctx, id, [memberId, employee.memberId ? String(employee.memberId) : null])
    if (member.employeeId && String(member.employeeId) !== id) throw new UserError('That member is already linked to another employee record.')
    if (!ctx.can('people.read_sensitive')) {
      const user = await User.findById(member.userId, { email: 1 }).lean()
      if (user?.email !== employee.workEmailLower) throw new UserError(`That member signs in with a different email from ${employee.fullName}'s work email. Ask an HR admin to link them.`)
    }
    await linkRecords(ctx, employee, member, 'single')
    revalidatePath(`${PEOPLE}/${id}`)
    return ok(`${employee.fullName} is linked to their Flowbit login. Their check-ins now feed the register.`)
  },
  OPTS,
)

export const unlinkEmployeeMember = action(
  z.object({ id: objectId }),
  async ({ id }, ctx) => {
    await assertVisible(ctx, id)
    const employee = await ctx.db(Employee).findById(id).lean()
    if (!employee?.memberId) return fail('This employee is not linked to a login.')
    assertMayChangeLogin(ctx, id, [String(employee.memberId)])
    await ctx.db(Member).updateOne({ _id: employee.memberId }, { $unset: { employeeId: 1 } })
    await ctx.db(Employee).updateOne({ _id: id }, { $unset: { memberId: 1 } })
    await audit(ctx, { action: 'employee.member_unlinked', entity: 'Employee', entityId: id, summary: `Unlinked ${employee.fullName} from their Flowbit login`, product: 'muster' })
    revalidatePath(`${PEOPLE}/${id}`)
    return ok(`${employee.fullName} is no longer linked to a login.`)
  },
  OPTS,
)

const INVITE_ROLES = ['member', 'manager', 'hr_exec', 'hr_admin', 'finance', 'sales', 'admin'] as const

/** Invites the employee to Flowbit by work email and links the new member to the record. */
export const inviteEmployee = action(
  z.object({ id: objectId, role: z.enum(INVITE_ROLES).default('member') }),
  async ({ id, role }, ctx) => {
    if (role !== 'member') ctx.assert('members.manage', 'Only someone who manages members can invite with a role other than Member.')
    await assertVisible(ctx, id)
    assertMayChangeLogin(ctx, id, [])
    assertCanGrant(ctx, describeRole(role, await customRolesOf(ctx)).permissions, { role })
    const employee = await ctx.db(Employee).findById(id).lean()
    if (!employee) throw new NotFoundError('That employee')
    // A revoked invite deletes its member and can leave this link behind; that is not a login.
    if (employee.memberId && (await ctx.db(Member).exists({ _id: employee.memberId }))) return fail(`${employee.fullName} already has a Flowbit login.`)
    const user = await User.findOne({ email: employee.workEmailLower }, { _id: 1 }).lean()
    const existing = user ? await ctx.db(Member).findOne({ userId: user._id }, { status: 1 }).lean() : null
    if (existing?.status === 'active') return fail(`${employee.workEmail} is already a member. Link them instead.`)
    if (existing?.status === 'disabled') return fail(`${employee.workEmail} was disabled. A workspace admin can enable them in Settings → Members.`)
    // A pending invite to this email is replaced (createInvite revokes it), so it is left out of the count.
    await assertCapacity(ctx, { addLogins: 1, addRoles: [role], excludeInviteEmails: [employee.workEmailLower] })
    const { member } = await createInvite(ctx, { email: employee.workEmailLower, role, name: employee.fullName, title: employee.designation ?? undefined, employeeId: employee._id })
    await ctx.db(Member).updateOne({ _id: member._id }, { $set: { employeeId: employee._id } })
    await ctx.db(Employee).updateOne({ _id: id }, { $set: { memberId: member._id } })
    revalidatePath(`${PEOPLE}/${id}`)
    return ok(`Invite sent to ${employee.workEmail}. The link works for a week.`)
  },
  OPTS,
)

/**
 * People → Link logins: links the chosen employees to the logins that sign in with their work email, in one go.
 * The pairs are worked out again on the server; one's own record is skipped unless one may decide one's own matters.
 */
export const linkLogins = action(
  z.object({ employeeIds: z.array(objectId).min(1, 'Tick at least one person').max(2000) }),
  async ({ employeeIds }, ctx) => {
    if (!mayManageLogins(ctx)) throw new UserError(LOGIN_ACCESS_REFUSAL)
    const { linked, skipped } = await linkChosen(ctx, employeeIds)
    revalidatePath(PEOPLE)
    revalidatePath('/app', 'layout')
    if (!linked) return fail('Nobody was linked: those logins or records were linked or changed meanwhile. Reopen Link logins.')
    const rest = skipped ? ` ${skipped} could not be linked any more and ${skipped === 1 ? 'was' : 'were'} left out.` : ''
    return ok(`${linked} ${linked === 1 ? 'person is' : 'people are'} linked to their Flowbit login. Their check-ins now feed the register.${rest}`)
  },
  OPTS,
)
