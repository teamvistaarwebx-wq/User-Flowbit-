import 'server-only'
import type { Types } from 'mongoose'
import type { Ctx } from '@/lib/ctx'
import { todayIST } from '@/lib/dates'
import { canUseProduct, entitlements } from '@/lib/entitlements'
import { notifyMembers } from '@/lib/notify'
import type { SystemDb } from '@/lib/platform'
import { Org } from '@/models/Org'
import { Suppression } from '@/models/messaging/Suppression'
import { Activity } from '@/models/orbit/Activity'
import { Lead } from '@/models/orbit/Lead'
import { Sequence } from '@/models/orbit/Sequence'
import { SequenceEnrollment } from '@/models/orbit/SequenceEnrollment'
import { listPeople } from '@/modules/work/teams/people'
import { refreshNextFollowUp } from '../next-step'
import { sendSequenceEmail } from './delivery'
import { exitForStage, exitForSuppression, firstNameOf, inSendWindow, nextDayWindowStart, nextRunAfter, nextWindowStart, renderTemplate, STEP_LABEL, type ExitReason, type SequenceStep, type SendWindow } from './rules'
import { returnDailySend, takeDailySend } from './store'

/**
 * /api/cron/sequences (every 15 minutes): runs the next step of every due
 * enrolment. Each row is claimed first (`claimedUntil`), so overlapping runs
 * never repeat a step. One failing enrolment never stops the others.
 */

const BATCH = 300
const CLAIM_MS = 10 * 60_000
const RETRY_MS = 60 * 60_000
const MAX_FAILURES = 3
const PAUSED_MS = 24 * 60 * 60_000
/** The run stops claiming enrolments after this, well inside the route's 300 s maxDuration. */
export const SEQUENCES_TIME_BUDGET_MS = 200_000

type Scope = Pick<Ctx, 'db'> & { orgId: Types.ObjectId }
type Enrollment = { _id: Types.ObjectId; orgId: Types.ObjectId; sequenceId: Types.ObjectId; leadId: Types.ObjectId; senderId: Types.ObjectId; stepIndex: number; failures: number; sendingStep?: number | null }
type Seq = { name: string; steps: SequenceStep[]; window: SendWindow; dailyCap: number; archivedAt?: Date | null }
type LeadRow = { _id: Types.ObjectId; companyName: string; contactName?: string | null; email?: string | null; stage: string; clientId?: Types.ObjectId | null; ownerId?: Types.ObjectId | null }
export type StepOutcome = 'sent' | 'task' | 'waited' | 'deferred' | 'exited' | 'completed' | 'failed'

const done = (scope: Scope, e: Enrollment, set: Record<string, unknown>, push?: Record<string, unknown>) =>
  scope.db(SequenceEnrollment).updateOne({ _id: e._id }, { $set: { claimedUntil: null, ...set }, ...(push ? { $push: { history: push } } : {}) })

const exit = async (scope: Scope, e: Enrollment, reason: ExitReason, now: Date): Promise<StepOutcome> => {
  await done(scope, e, { status: 'exited', exitReason: reason, finishedAt: now })
  return 'exited'
}

const defer = async (scope: Scope, e: Enrollment, until: Date): Promise<StepOutcome> => {
  await done(scope, e, { nextRunAt: until })
  return 'deferred'
}

/** Moves on to the next step (or finishes), recording what this one did. */
async function advance(scope: Scope, e: Enrollment, seq: Seq, step: SequenceStep, now: Date, entry: { outcome: 'sent' | 'task' | 'waited'; via?: 'gmail' | 'resend'; note?: string; threadId?: string }): Promise<StepOutcome> {
  const next = e.stepIndex + 1
  const finished = next >= seq.steps.length
  await done(scope, e, { stepIndex: next, failures: 0, sendingStep: null, nextRunAt: nextRunAfter(step, now), ...(finished ? { status: 'completed', finishedAt: now } : {}) }, { stepIndex: e.stepIndex, kind: step.kind, at: now, outcome: entry.outcome, via: entry.via ?? null, note: entry.note, ...(entry.threadId ? { threadId: entry.threadId } : {}) })
  return entry.outcome
}

/** Call task or reminder: a planned Orbit activity for the sender, due today. */
/** Call and reminder steps: inside the send window, a task for the lead's current owner (the sender when it has none). */
async function runTaskStep(scope: Scope, e: Enrollment, seq: Seq, step: SequenceStep, lead: LeadRow, now: Date): Promise<StepOutcome> {
  if (!inSendWindow(now, seq.window)) return defer(scope, e, nextWindowStart(now, seq.window))
  const assigneeId = lead.ownerId ?? e.senderId
  const who = lead.contactName || lead.companyName
  const title = step.note?.trim() || (step.kind === 'call' ? `Call ${who}` : `Follow up with ${who}`)
  await scope.db(Activity).create({ leadId: lead._id, clientId: lead.clientId ?? null, type: step.kind === 'call' ? 'call' : 'follow_up', status: 'planned', channel: step.kind === 'call' ? 'phone' : 'other', title, notes: `From the sequence '${seq.name}'`, dueDate: todayIST(now), assigneeId, createdBy: e.senderId })
  await refreshNextFollowUp(scope, { leadId: lead._id })
  if (step.kind === 'reminder') await notifyMembers({ orgId: scope.orgId, userId: null }, [assigneeId], { title: `${title} (${lead.companyName})`, href: `/app/orbit/leads/${lead._id}`, kind: 'info', product: 'orbit', event: 'orbit.sequence_reminder' })
  return advance(scope, e, seq, step, now, { outcome: 'task', note: title })
}

/** Email: inside the window, not suppressed, within today's cap; then Gmail or Flowbit mail. */
async function runEmailStep(scope: Scope, e: Enrollment, seq: Seq, step: SequenceStep, lead: LeadRow, now: Date): Promise<StepOutcome> {
  if (!inSendWindow(now, seq.window)) return defer(scope, e, nextWindowStart(now, seq.window))
  const to = (lead.email ?? '').trim().toLowerCase()
  if (!to) return exit(scope, e, 'no_email', now)
  const suppressed = await scope.db(Suppression).findOne({ channel: 'email', address: to }, { source: 1 }).lean()
  if (suppressed) return exit(scope, e, exitForSuppression(suppressed.source), now)
  // A run died between handing this step to Gmail/Resend and moving on: it may have gone out, so never send it again.
  if (e.sendingStep === e.stepIndex) return advance(scope, e, seq, step, now, { outcome: 'sent', note: 'Sent earlier; the run stopped before it was confirmed' })
  const day = todayIST(now)
  if (!(await takeDailySend(scope, e.senderId, day, seq.dailyCap))) return defer(scope, e, nextDayWindowStart(now, seq.window))
  const [sender] = await listPeople(scope, [e.senderId])
  const vars = { first_name: firstNameOf(lead.contactName), company: lead.companyName, owner: sender?.name ?? '' }
  const subject = renderTemplate(step.subject ?? '', vars)
  await scope.db(SequenceEnrollment).updateOne({ _id: e._id }, { $set: { sendingStep: e.stepIndex } })
  let result: Awaited<ReturnType<typeof sendSequenceEmail>>
  try {
    result = await sendSequenceEmail(scope, { orgId: scope.orgId, senderId: e.senderId, senderEmail: sender?.email ?? '', to, subject, body: renderTemplate(step.body ?? '', vars), leadId: lead._id, enrollmentId: e._id, stepIndex: e.stepIndex })
  } catch (error) {
    // Thrown before anything went out (token lookup, queueing): give the cap slot back and allow a retry.
    await returnDailySend(scope, e.senderId, day)
    await scope.db(SequenceEnrollment).updateOne({ _id: e._id }, { $set: { sendingStep: null } })
    throw error
  }
  if (!result.ok) {
    await returnDailySend(scope, e.senderId, day)
    if (e.failures + 1 >= MAX_FAILURES) return exit(scope, e, 'failed', now)
    await done(scope, e, { failures: e.failures + 1, sendingStep: null, nextRunAt: new Date(now.getTime() + RETRY_MS) }, { stepIndex: e.stepIndex, kind: 'email', at: now, outcome: 'failed', via: result.via, note: result.error.slice(0, 300) })
    return 'failed'
  }
  // Advance first: the email is out, so the step must never run again even if logging it fails.
  const outcome = await advance(scope, e, seq, step, now, { outcome: 'sent', via: result.via, note: subject, threadId: result.threadId })
  await logSentEmail(scope, e, seq, lead, subject, now)
  return outcome
}

/** The sent email on the lead's timeline; best effort, after the step has advanced. */
async function logSentEmail(scope: Scope, e: Enrollment, seq: Seq, lead: LeadRow, subject: string, now: Date): Promise<void> {
  try {
    await scope.db(Activity).create({ leadId: lead._id, clientId: lead.clientId ?? null, type: 'email', status: 'done', channel: 'email', title: subject, notes: `Sent by the sequence '${seq.name}' (step ${e.stepIndex + 1})`, occurredAt: now, assigneeId: e.senderId, createdBy: e.senderId, automated: true })
    await scope.db(Lead).updateOne({ _id: lead._id }, { $set: { lastActivityAt: now } })
  } catch (error) {
    console.error('[cron sequences] could not log a sent email', String(e._id), error)
  }
}

/** Runs the enrolment's current step. */
export async function runStep(scope: Scope, e: Enrollment, now: Date): Promise<StepOutcome> {
  const [seq, lead] = await Promise.all([
    scope.db(Sequence).findOne({ _id: e.sequenceId }).lean() as Promise<Seq | null>,
    scope.db(Lead).findOne({ _id: e.leadId }, { companyName: 1, contactName: 1, email: 1, stage: 1, clientId: 1, ownerId: 1 }).lean() as Promise<LeadRow | null>,
  ])
  if (!lead) return exit(scope, e, 'lead_gone', now)
  const stageExit = exitForStage(lead.stage)
  if (stageExit) return exit(scope, e, stageExit, now)
  if (!seq || seq.archivedAt) return exit(scope, e, 'archived', now)
  const step = seq.steps[e.stepIndex]
  if (!step) {
    await done(scope, e, { status: 'completed', finishedAt: now })
    return 'completed'
  }
  if (step.kind === 'wait') return advance(scope, e, seq, step, now, { outcome: 'waited', note: `${STEP_LABEL.wait} ${step.waitDays ?? 1} day(s)` })
  if (step.kind === 'email') return runEmailStep(scope, e, seq, step, lead, now)
  return runTaskStep(scope, e, seq, step, lead, now)
}

/** Live workspaces with Orbit on: a paused, read-only or deleted one waits a day. */
async function orgCanRun(db: SystemDb, orgId: Types.ObjectId, cache: Map<string, boolean>, now: Date): Promise<boolean> {
  const key = String(orgId)
  if (!cache.has(key)) {
    const org = await db.raw(Org).findById(orgId).lean()
    const ent = org && !org.deletedAt && !org.disabled ? entitlements(org, now) : null
    cache.set(key, Boolean(ent && ent.access === 'full' && canUseProduct(ent, 'orbit')))
  }
  return cache.get(key) ?? false
}

export type RunSummary = Record<StepOutcome | 'skipped', number>

export async function runSequences(db: SystemDb, now: Date = new Date(), clock: () => number = Date.now): Promise<RunSummary> {
  const deadline = clock() + SEQUENCES_TIME_BUDGET_MS
  const summary: RunSummary = { sent: 0, task: 0, waited: 0, deferred: 0, exited: 0, completed: 0, failed: 0, skipped: 0 }
  const free = { $or: [{ claimedUntil: null }, { claimedUntil: { $lte: now } }] }
  const due = await db.raw(SequenceEnrollment).find({ status: 'active', nextRunAt: { $lte: now }, ...free }, { _id: 1 }).sort({ nextRunAt: 1 }).limit(BATCH).lean()
  const orgs = new Map<string, boolean>()
  for (const row of due) {
    // Out of time: the rest stay unclaimed for the next run.
    if (clock() > deadline) break
    const e = (await db.raw(SequenceEnrollment).findOneAndUpdate({ _id: row._id, status: 'active', ...free }, { $set: { claimedUntil: new Date(now.getTime() + CLAIM_MS) } }, { returnDocument: 'after' }).lean()) as Enrollment | null
    if (!e) continue
    const scope = { orgId: e.orgId, ...db.forOrg(e.orgId) }
    try {
      if (!(await orgCanRun(db, e.orgId, orgs, now))) {
        await defer(scope, e, new Date(now.getTime() + PAUSED_MS))
        summary.skipped += 1
        continue
      }
      summary[await runStep(scope, e, now)] += 1
    } catch (error) {
      summary.failed += 1
      console.error('[cron sequences] step failed', String(e._id), error)
      await done(scope, e, { nextRunAt: new Date(now.getTime() + RETRY_MS) }).catch(() => {})
    }
  }
  return summary
}
