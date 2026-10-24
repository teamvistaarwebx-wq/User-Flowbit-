import 'server-only'
import type { Ctx } from '@/lib/ctx'
import { Lead } from '@/models/orbit/Lead'
import { Sequence } from '@/models/orbit/Sequence'
import { SequenceEnrollment } from '@/models/orbit/SequenceEnrollment'
import { listPeople } from '@/modules/work/teams/people'
import { leadAccess, viewAll } from '../scope'
import { EXIT_LABEL, progressLabel, type ExitReason, type SequenceStep } from './rules'

/** Sequence lists, the builder's saved values, enrolments and a lead's progress. */

export type SequenceRow = { id: string; name: string; steps: number; active: number; completed: number; replied: number; exited: number; createdBy: string; canEdit: boolean }

const canEditSeq = (ctx: Ctx, createdBy: unknown) => String(createdBy) === String(ctx.memberId) || ctx.can('orbit.close')

export async function listSequences(ctx: Ctx): Promise<SequenceRow[]> {
  const seqs = await ctx.db(Sequence).find({ archivedAt: null }).sort({ name: 1 }).lean()
  const counts = await ctx.db(SequenceEnrollment).aggregate<{ _id: { s: unknown; status: string; reason: string | null }; n: number }>([
    { $match: { sequenceId: { $in: seqs.map((s) => s._id) } } },
    { $group: { _id: { s: '$sequenceId', status: '$status', reason: '$exitReason' }, n: { $sum: 1 } } },
  ])
  const people = new Map((await listPeople(ctx, seqs.map((s) => s.createdBy))).map((p) => [p.id, p.name]))
  const count = (id: unknown, pick: (k: { status: string; reason: string | null }) => boolean) => counts.filter((c) => String(c._id.s) === String(id) && pick(c._id)).reduce((sum, c) => sum + c.n, 0)
  return seqs.map((s) => ({
    id: String(s._id),
    name: s.name,
    steps: s.steps.length,
    active: count(s._id, (k) => k.status === 'active'),
    completed: count(s._id, (k) => k.status === 'completed'),
    replied: count(s._id, (k) => k.reason === 'replied'),
    exited: count(s._id, (k) => k.status === 'exited'),
    createdBy: people.get(String(s.createdBy)) ?? 'Former member',
    canEdit: canEditSeq(ctx, s.createdBy),
  }))
}

export type SequenceFormValues = { id?: string; name: string; steps: SequenceStep[]; startHour: number; endHour: number; dailyCap: number }

export async function sequenceForEdit(ctx: Ctx, id: string): Promise<(SequenceFormValues & { canEdit: boolean }) | null> {
  const s = await ctx.db(Sequence).findOne({ _id: id, archivedAt: null }).lean()
  if (!s) return null
  return {
    id: String(s._id),
    name: s.name,
    steps: s.steps.map((x) => ({ kind: x.kind, subject: x.subject ?? '', body: x.body ?? '', note: x.note ?? '', waitDays: x.waitDays ?? undefined })) as SequenceStep[],
    startHour: s.window?.startHour ?? 10,
    endHour: s.window?.endHour ?? 18,
    dailyCap: s.dailyCap ?? 150,
    canEdit: canEditSeq(ctx, s.createdBy),
  }
}

export type EnrollmentRow = { id: string; leadId: string; company: string; sender: string; status: string; progress: string; outcome: string | null; lastAt: string | null }

/** Enrolments on leads the member can see, newest first. */
export async function sequenceEnrollments(ctx: Ctx, id: string, steps: readonly SequenceStep[]): Promise<EnrollmentRow[]> {
  const leadFilter = viewAll(ctx) ? {} : { leadId: { $in: await ctx.db(Lead).distinct('_id', leadAccess(ctx)) } }
  const rows = await ctx.db(SequenceEnrollment).find({ sequenceId: id, ...leadFilter }).sort({ createdAt: -1 }).limit(200).lean()
  const [leads, people] = await Promise.all([
    ctx.db(Lead).find({ _id: { $in: rows.map((r) => r.leadId) } }, { companyName: 1 }).lean(),
    listPeople(ctx, rows.map((r) => r.senderId)),
  ])
  const company = new Map(leads.map((l) => [String(l._id), l.companyName]))
  const name = new Map(people.map((p) => [p.id, p.name]))
  return rows.map((r) => ({
    id: String(r._id),
    leadId: String(r.leadId),
    company: company.get(String(r.leadId)) ?? 'Deleted lead',
    sender: name.get(String(r.senderId)) ?? 'Former member',
    status: r.status,
    progress: r.status === 'active' ? progressLabel(r.stepIndex, steps) : r.status === 'completed' ? 'All steps done' : `Stopped: ${EXIT_LABEL[r.exitReason as ExitReason] ?? 'stopped'}`,
    outcome: r.exitReason ?? null,
    lastAt: r.history.at(-1)?.at?.toISOString() ?? null,
  }))
}

export type LeadSequence = {
  enrollmentId: string
  sequenceId: string
  name: string
  status: string
  progress: string
  nextRunAt: string | null
  history: { step: number; label: string; outcome: string; at: string; via: string | null }[]
  steps: number
  doneSteps: number
}

/** The lead's live enrolment, else its latest one, for the lead page. */
export async function leadSequence(ctx: Ctx, leadId: string): Promise<LeadSequence | null> {
  const e = (await ctx.db(SequenceEnrollment).findOne({ leadId, status: 'active' }).lean()) ?? (await ctx.db(SequenceEnrollment).findOne({ leadId }).sort({ createdAt: -1 }).lean())
  if (!e) return null
  const seq = await ctx.db(Sequence).findOne({ _id: e.sequenceId }, { name: 1, steps: 1 }).lean()
  const steps = (seq?.steps ?? []) as SequenceStep[]
  return {
    enrollmentId: String(e._id),
    sequenceId: String(e.sequenceId),
    name: seq?.name ?? 'Deleted sequence',
    status: e.status,
    progress: e.status === 'active' ? progressLabel(e.stepIndex, steps) : e.status === 'completed' ? 'All steps done' : `Stopped: ${EXIT_LABEL[e.exitReason as ExitReason] ?? 'stopped'}`,
    nextRunAt: e.status === 'active' ? (e.nextRunAt?.toISOString() ?? null) : null,
    history: e.history.map((h) => ({ step: h.stepIndex + 1, label: h.note ?? '', outcome: h.outcome, at: h.at.toISOString(), via: h.via ?? null })),
    steps: steps.length,
    doneSteps: Math.min(e.stepIndex, steps.length),
  }
}

/** Active sequences for the Enroll pickers. */
export async function sequenceOptions(ctx: Ctx): Promise<{ value: string; label: string; hint: string }[]> {
  const seqs = await ctx.db(Sequence).find({ archivedAt: null }, { name: 1, steps: 1 }).sort({ name: 1 }).lean()
  return seqs.map((s) => ({ value: String(s._id), label: s.name, hint: `${s.steps.length} ${s.steps.length === 1 ? 'step' : 'steps'}` }))
}
