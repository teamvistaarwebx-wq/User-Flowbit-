import 'server-only'
import type { Types } from 'mongoose'
import { audit } from '@/lib/audit'
import type { Ctx } from '@/lib/ctx'
import { UserError } from '@/lib/errors'
import { EmployeeDocument } from '@/models/muster/EmployeeDocument'
import { docLabel } from '../settings/defaults'
import { getPolicy } from '../settings/queries'
import { statusLabelOf } from './lifecycle'
import { onboardingRefusal, onboardingStatus, startsWork, type OnboardingStatus } from './onboarding'

/** HR admins (who set the rules) may let someone start before their documents are in. */
export const ONBOARDING_OVERRIDE_PERM = 'hr.settings' as const

/** The person's joining-document progress against the workspace's rules. */
export async function onboardingFor(ctx: Pick<Ctx, 'db'>, employeeId?: Types.ObjectId | string | null): Promise<OnboardingStatus> {
  const [policy, docs] = await Promise.all([getPolicy(ctx), employeeId ? ctx.db(EmployeeDocument).distinct('docType', { employeeId, deletedAt: null }) : Promise.resolve([])])
  return onboardingStatus(policy.onboarding, docs.map(String))
}

type GateInput = { employeeId?: Types.ObjectId | string | null; name: string; from: string | null; to: string; overrideReason?: string | null }

/**
 * Refuses a move into work while the joining documents are below the
 * threshold. An HR admin may pass a reason to start them anyway; the caller
 * then records it with `auditOnboardingOverride`. Returns the status when overridden.
 */
export async function checkOnboardingGate(ctx: Ctx, input: GateInput): Promise<OnboardingStatus | null> {
  if (!startsWork(input.from, input.to)) return null
  const status = await onboardingFor(ctx, input.employeeId)
  const refusal = onboardingRefusal({ name: input.name, from: input.from, to: input.to, status })
  if (!refusal) return null
  const reason = input.overrideReason?.trim()
  if (!reason && ctx.can(ONBOARDING_OVERRIDE_PERM)) {
    throw new UserError(`Joining documents are ${status.percent}% complete; ${status.threshold}% is needed. Give a reason to start ${input.name} anyway, or upload the documents first.`, { onboardingOverride: 'Give a reason to start them anyway.' })
  }
  if (!reason) throw new UserError(refusal, { status: `Joining documents are ${status.percent}% complete; ${status.threshold}% is needed.` })
  if (!ctx.can(ONBOARDING_OVERRIDE_PERM)) throw new UserError('Only an HR admin can start someone before their joining documents are in.', { onboardingOverride: 'Only an HR admin can do this.' })
  return status
}

export async function auditOnboardingOverride(ctx: Ctx, employee: { _id: Types.ObjectId | string; fullName: string }, to: string, status: OnboardingStatus, reason: string): Promise<void> {
  await audit(ctx, {
    action: 'employee.onboarding_overridden',
    entity: 'Employee',
    entityId: employee._id,
    summary: `${employee.fullName} made ${statusLabelOf(to)} with joining documents ${status.percent}% complete (needed ${status.threshold}%)`,
    product: 'muster',
    meta: { reason, percent: status.percent, threshold: status.threshold, missing: status.missing.map(docLabel) },
  })
}
