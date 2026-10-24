/**
 * Approval routing for leave, attendance corrections and comp-off (pure).
 * A request goes to the reporting manager first (when their login may approve
 * this kind of request and they are not the applicant), then to HR. When the applicant could sign HR's
 * stage themselves, the last stage is "management" (approvals.escalated).
 */

export const STAGES = ['manager', 'hr', 'management'] as const
export type ApprovalStage = (typeof STAGES)[number]

export function stagesFor(input: { employeeId: string; managerId?: string | null; managerCanSign: boolean; applicantCanSignHr: boolean }): ApprovalStage[] {
  const stages: ApprovalStage[] = []
  if (input.managerId && input.managerCanSign && input.managerId !== input.employeeId) stages.push('manager')
  stages.push(input.applicantCanSignHr ? 'management' : 'hr')
  return stages
}

/** The first stage not yet signed, or null when all are done. */
export function currentStage(stages: readonly string[], completed: readonly string[]): ApprovalStage | null {
  const route = stages.length ? stages : ['hr']
  return (route.find((s) => !completed.includes(s)) as ApprovalStage | undefined) ?? null
}

export type Actor = {
  /** The actor's own employee record, if linked. */
  employeeId?: string | null
  /** Holds the HR permission for this kind of request (and sees everyone). */
  canSignHr: boolean
  /** approvals.escalated */
  canEscalated: boolean
  /** May decide their own requests (owner/admin with roles.manage). */
  canDecideOwn: boolean
}

export type Routed = {
  employeeId: string
  managerId?: string | null
  stages: readonly string[]
  completedStages: readonly string[]
  status: string
  /** The manager stage can no longer be signed by that manager (no login that may approve, or no longer their manager): HR signs it instead. */
  managerLapsed?: boolean
}

export const OWN_RECORD_REFUSAL = 'This is about your own record, so someone else has to make this decision.'
export const NOT_YOURS = 'That request no longer exists, or is not yours to decide.'

/** Whether the actor may sign `stage` on this request. Management can step in at any stage. */
export function canActOn(actor: Actor, request: Routed, stage: ApprovalStage): boolean {
  if (actor.employeeId && actor.employeeId === request.employeeId && !actor.canDecideOwn) return false
  if (actor.canEscalated) return true
  if (stage === 'manager') return request.managerLapsed ? actor.canSignHr : Boolean(actor.employeeId && request.managerId && actor.employeeId === request.managerId)
  if (stage === 'hr') return actor.canSignHr
  return false
}

/** True when the request is pending and its current stage is the actor's to sign. */
export function isDecidableBy(actor: Actor, request: Routed): boolean {
  if (request.status !== 'pending') return false
  const stage = currentStage(request.stages, request.completedStages)
  return stage ? canActOn(actor, request, stage) : false
}

/** Why the actor cannot decide, or null. */
export function decisionRefusal(actor: Actor, request: Routed): string | null {
  if (request.status !== 'pending') return 'That request has already been decided.'
  if (actor.employeeId && actor.employeeId === request.employeeId && !actor.canDecideOwn) return OWN_RECORD_REFUSAL
  return isDecidableBy(actor, request) ? null : NOT_YOURS
}

/** Applies a decision: a rejection settles it, an approval advances it or finishes it. */
export function applyDecision(request: Routed, decision: 'approved' | 'rejected'): { status: 'pending' | 'approved' | 'rejected'; completedStages: string[]; stage: ApprovalStage; final: boolean } {
  const stage = currentStage(request.stages, request.completedStages) ?? 'hr'
  if (decision === 'rejected') return { status: 'rejected', completedStages: [...request.completedStages], stage, final: true }
  // HR signing a lapsed manager stage also signs its own stage, so the request does not wait on HR twice.
  const stepIn = stage === 'manager' && request.managerLapsed && currentStage(request.stages, [...request.completedStages, stage]) === 'hr'
  const completedStages = [...request.completedStages, stage, ...(stepIn ? ['hr'] : [])]
  const next = currentStage(request.stages, completedStages)
  return { status: next ? 'pending' : 'approved', completedStages, stage, final: !next }
}

/** "With HR" / "With Arjun (manager)" style label of where a request sits. */
export function whereItSits(request: Routed, managerName?: string): string {
  if (request.status !== 'pending') return request.status === 'approved' ? 'Approved' : request.status === 'rejected' ? 'Rejected' : 'Withdrawn'
  const stage = currentStage(request.stages, request.completedStages)
  if (stage === 'manager' && !request.managerLapsed) return managerName ? `With ${managerName} (manager)` : 'With the manager'
  return stage === 'management' ? 'With management' : 'With HR'
}
