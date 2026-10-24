'use server'

import { revalidatePath } from 'next/cache'
import type { Types } from 'mongoose'
import { z } from 'zod'
import { action, fail, ok } from '@/lib/actions'
import { audit } from '@/lib/audit'
import type { Ctx } from '@/lib/ctx'
import { formatDate, formatMonth, monthOf, todayIST } from '@/lib/dates'
import { formatINR } from '@/lib/money'
import { notifyPermission } from '@/lib/notify'
import { formatSeq, nextSeq } from '@/lib/sequence'
import { objectId } from '@/lib/validation'
import { FolioBillingPlan } from '@/models/folio/BillingPlan'
import { FolioRetainer } from '@/models/folio/Retainer'
import { Project } from '@/models/work/Project'
import { FOLIO, loadClient, loadEntity } from '../context'
import { getFolioSettings, taxRatesOf } from '../settings/queries'
import { generateRetainerInvoices, RETAINERS_BUSY, retainerSchedules, type GenerateResult } from './generate'
import { milestoneAmount, milestoneIssues } from './plan-math'
import type { MILESTONE_STATUSES } from '../types'
import { generateMilestoneInvoice, loadPlan, type PlanDoc } from './plans'
import { planSchema, retainerSchema, type PlanInput } from './schemas'

const refresh = (planId?: string) => {
  revalidatePath('/app/folio/recurring')
  revalidatePath('/app/folio/invoices')
  revalidatePath('/app/folio')
  if (planId) revalidatePath(`/app/folio/recurring/plans/${planId}`)
}

/** Entity and client of this org, and a GST rate the entity may charge (0 on a non-GST entity). */
async function billingParties(ctx: Ctx, input: { entityId: string; clientId: string; gstRatePercent: number }) {
  const [entity, client, settings] = await Promise.all([loadEntity(ctx, input.entityId, { active: true }), loadClient(ctx, input.clientId), getFolioSettings(ctx)])
  const gstRatePercent = entity.kind === 'gst' ? input.gstRatePercent : 0
  const rates = taxRatesOf(settings)
  return { entity, client, gstRatePercent, rateError: entity.kind === 'gst' && !rates.includes(gstRatePercent) ? `Use one of ${rates.join(', ')}%` : null }
}

export const saveRetainer = action(
  retainerSchema,
  async (input, ctx) => {
    const { client, gstRatePercent, rateError } = await billingParties(ctx, input)
    if (rateError) return fail('Some fields need attention.', { gstRatePercent: rateError })
    const fields = {
      clientId: input.clientId, entityId: input.entityId, name: input.name, description: input.description, hsnSac: input.hsnSac, amountPaise: input.amount, gstRatePercent,
      frequency: input.frequency, startDate: input.startDate, endDate: input.endDate ?? null, billingDay: input.billingDay, billInAdvance: input.billInAdvance,
      autoGenerate: input.autoGenerate, paymentTermsDays: input.paymentTermsDays ?? null, hoursPerMonth: input.hoursPerMonth ?? null, notes: input.notes,
    }
    if (input.id) {
      const before = await ctx.db(FolioRetainer).findById(input.id).lean()
      if (!before) return fail('That retainer was not found. It may have been removed.')
      await ctx.db(FolioRetainer).updateOne({ _id: before._id }, { $set: fields })
      await audit(ctx, { action: 'retainer.updated', entity: 'FolioRetainer', entityId: before._id, summary: `Edited retainer ${input.name} for ${client.name}`, product: 'folio', changes: { before, after: { ...before, ...fields } } })
      refresh()
      return ok(`Retainer "${input.name}" saved. Changes apply to future drafts.`)
    }
    const created = await ctx.db(FolioRetainer).create({ ...fields, status: 'active', createdBy: ctx.memberId })
    await audit(ctx, { action: 'retainer.created', entity: 'FolioRetainer', entityId: created._id, summary: `Added retainer ${input.name} for ${client.name} (${formatINR(input.amount)} ${input.frequency})`, product: 'folio' })
    refresh()
    return ok(`Retainer "${input.name}" added for ${client.name}`)
  },
  { ...FOLIO, perm: 'recurring.write' },
)

export const setRetainerStatus = action(
  z.object({ id: objectId, status: z.enum(['active', 'paused', 'ended']) }),
  async ({ id, status }, ctx) => {
    const retainer = await ctx.db(FolioRetainer).findById(id).lean()
    if (!retainer) return fail('That retainer was not found. It may have been removed.')
    if (retainer.status === 'ended') return fail('An ended retainer stays ended. Add a new one to start billing again.')
    const today = todayIST()
    const resumes = status === 'active' && retainer.status === 'paused'
    const set = status === 'ended' ? { status, endDate: retainer.endDate ?? (today < retainer.startDate ? retainer.startDate : today) } : resumes ? { status, resumeFrom: today } : { status }
    await ctx.db(FolioRetainer).updateOne({ _id: retainer._id }, { $set: set })
    await audit(ctx, { action: `retainer.${status === 'active' ? 'resumed' : status}`, entity: 'FolioRetainer', entityId: retainer._id, summary: `Retainer ${retainer.name} ${status === 'active' ? 'resumed' : status}`, product: 'folio' })
    refresh()
    return ok(status === 'active' ? `Retainer "${retainer.name}" resumed` : status === 'paused' ? `Retainer "${retainer.name}" paused. No drafts until you resume it.` : `Retainer "${retainer.name}" ended`)
  },
  { ...FOLIO, perm: 'recurring.write' },
)

async function afterGenerate(ctx: Ctx, result: GenerateResult): Promise<string> {
  const n = result.created.length
  if (n) {
    await audit(ctx, { action: 'retainer.drafts_generated', entity: 'FolioRetainer', summary: `Generated ${n} retainer draft${n === 1 ? '' : 's'}`, product: 'folio', meta: { created: result.created } })
    if (!ctx.can('invoices.issue')) await notifyPermission(ctx, 'invoices.issue', { title: `${n} retainer draft${n === 1 ? '' : 's'} created for ${formatMonth(monthOf())}`, href: '/app/folio/invoices?status=draft', kind: 'approval', product: 'folio', event: 'folio.retainer_drafts' })
    refresh()
    return `${n} draft invoice${n === 1 ? '' : 's'} created. Review ${n === 1 ? 'it' : 'them'} before issuing.`
  }
  if (result.skipped[0]?.reason === RETAINERS_BUSY) return RETAINERS_BUSY
  return result.skipped.length ? `Nothing generated. ${result.skipped[0].name}: ${result.skipped[0].reason}` : 'No retainers are due right now.'
}

export const generateDueDrafts = action(
  z.object({}),
  async (_input, ctx) => {
    const result = await generateRetainerInvoices(ctx, todayIST())
    const message = await afterGenerate(ctx, result)
    return result.created.length || !result.skipped.length ? ok(message, { created: result.created.length }) : fail(message)
  },
  { ...FOLIO, perm: 'invoices.write' },
)

/** Bills a retainer's due periods now; when nothing is due yet, drafts the next period early. */
export const billRetainerNow = action(
  z.object({ id: objectId }),
  async ({ id }, ctx) => {
    const retainer = await ctx.db(FolioRetainer).findById(id).lean()
    if (!retainer) return fail('That retainer was not found. It may have been removed.')
    if (retainer.status !== 'active') return fail('Only an active retainer can be billed. Resume it first.')
    const schedule = (await retainerSchedules(ctx, [retainer], todayIST())).get(String(retainer._id))
    if (!schedule?.next) return fail(`${retainer.name} has no billing date left. Its end date has passed.`)
    const asOf = schedule.due.length ? todayIST() : schedule.next
    const result = await generateRetainerInvoices(ctx, asOf, { retainerIds: [String(retainer._id)] })
    const message = await afterGenerate(ctx, result)
    if (!result.created.length) return fail(message)
    return ok(schedule.due.length ? message : `Drafted the ${formatDate(schedule.next)} invoice for ${retainer.name} early. Review it before issuing.`, undefined, `/app/folio/invoices/${result.created[0].invoiceId}`)
  },
  { ...FOLIO, perm: 'invoices.write' },
)

type MilestoneStatus = (typeof MILESTONE_STATUSES)[number]
type PhaseRow = { _id?: Types.ObjectId; position: number; name: string; description?: string; percentOfTotal: number | null; amountPaise: number | null; dueOn: string | null; status: MilestoneStatus; invoiceId: Types.ObjectId | null; completedOn: string | null }

const isLocked = (m: { status: string; invoiceId?: unknown }) => Boolean(m.invoiceId) || m.status === 'invoiced' || m.status === 'paid'

/**
 * Phases for storage. Invoiced or paid phases keep their amount whatever is
 * posted, and are pinned as flat amounts when the plan value changes.
 */
function phasesFor(input: PlanInput, existing: PlanDoc | null): { phases: PhaseRow[]; error?: string } {
  const previous = new Map((existing?.milestones ?? []).map((m) => [String(m._id), m]))
  const kept = new Set(input.milestones.map((m) => m.id).filter(Boolean))
  const dropped = [...previous.values()].find((m) => !kept.has(String(m._id)) && isLocked(m))
  if (dropped) return { phases: [], error: `"${dropped.name}" is already invoiced, so it cannot be removed.` }
  const valueChanged = Boolean(existing) && existing?.totalValuePaise !== input.totalValue
  const phases = input.milestones.map((m, i): PhaseRow => {
    const prev = m.id ? previous.get(m.id) : undefined
    const posted = { percentOfTotal: m.mode === 'percent' ? (m.percent ?? null) : null, amountPaise: m.mode === 'amount' ? (m.amount ?? null) : null }
    const amounts = !prev || !isLocked(prev) ? posted : valueChanged ? { percentOfTotal: null, amountPaise: milestoneAmount(existing?.totalValuePaise ?? 0, prev) } : { percentOfTotal: prev.percentOfTotal ?? null, amountPaise: prev.amountPaise ?? null }
    return { ...(prev ? { _id: prev._id } : {}), position: i + 1, name: m.name, description: m.description, ...amounts, dueOn: m.dueOn ?? null, status: prev?.status ?? 'pending', invoiceId: prev?.invoiceId ?? null, completedOn: prev?.completedOn ?? null }
  })
  return { phases }
}

export const savePlan = action(
  planSchema,
  async (input, ctx) => {
    const { client, gstRatePercent, rateError } = await billingParties(ctx, input)
    if (rateError) return fail('Some fields need attention.', { gstRatePercent: rateError })
    if (input.workProjectId && !(await ctx.db(Project).exists({ _id: input.workProjectId }))) return fail('Some fields need attention.', { workProjectId: 'Pick a project from this workspace' })
    const existing = input.id ? await loadPlan(ctx, input.id) : null
    const { phases, error } = phasesFor(input, existing)
    if (error) return fail(error)
    const issue = milestoneIssues(input.totalValue, phases)
    if (issue) return fail(issue)
    const fields = { clientId: input.clientId, entityId: input.entityId, workProjectId: input.workProjectId ?? null, name: input.name, description: input.description, hsnSac: input.hsnSac, totalValuePaise: input.totalValue, gstRatePercent, startDate: input.startDate ?? null, targetEndDate: input.targetEndDate ?? null, status: input.status, notes: input.notes, milestones: phases }
    if (existing) {
      await ctx.db(FolioBillingPlan).updateOne({ _id: existing._id }, { $set: fields })
      await audit(ctx, { action: 'plan.updated', entity: 'FolioBillingPlan', entityId: existing._id, summary: `Edited billing plan ${existing.code} ${input.name}`, product: 'folio' })
      refresh(String(existing._id))
      return ok(`Billing plan "${input.name}" saved`, { id: String(existing._id) }, `/app/folio/recurring/plans/${existing._id}`)
    }
    const code = formatSeq(await nextSeq(ctx.orgId, 'folio:plan'), { prefix: 'PLN-', pad: 4 })
    const created = await ctx.db(FolioBillingPlan).create({ ...fields, code, createdBy: ctx.memberId })
    await audit(ctx, { action: 'plan.created', entity: 'FolioBillingPlan', entityId: created._id, summary: `Added billing plan ${code} ${input.name} for ${client.name} (${formatINR(input.totalValue)})`, product: 'folio' })
    refresh()
    return ok(`Billing plan ${code} added for ${client.name}`, { id: String(created._id) }, `/app/folio/recurring/plans/${created._id}`)
  },
  { ...FOLIO, perm: 'recurring.write' },
)

export const raiseMilestoneInvoice = action(
  z.object({ planId: objectId, milestoneId: objectId }),
  async ({ planId, milestoneId }, ctx) => {
    const { invoiceId, amountPaise, label } = await generateMilestoneInvoice(ctx, planId, milestoneId, todayIST())
    await audit(ctx, { action: 'invoice.draft_created', entity: 'Invoice', entityId: invoiceId, summary: `Drafted the ${label} invoice (${formatINR(amountPaise)} before tax)`, product: 'folio' })
    refresh(planId)
    return ok(`Draft invoice for ${label} created. Review it before issuing.`, undefined, `/app/folio/invoices/${invoiceId}`)
  },
  { ...FOLIO, perm: 'invoices.write' },
)

export const setPlanStatus = action(
  z.object({ id: objectId, status: z.enum(['active', 'on_hold', 'completed', 'cancelled']) }),
  async ({ id, status }, ctx) => {
    const plan = await loadPlan(ctx, id)
    await ctx.db(FolioBillingPlan).updateOne({ _id: plan._id }, { $set: { status } })
    await audit(ctx, { action: 'plan.status_changed', entity: 'FolioBillingPlan', entityId: plan._id, summary: `Billing plan ${plan.code} marked ${status.replace('_', ' ')}`, product: 'folio' })
    refresh(id)
    return ok(`${plan.name} marked ${status.replace('_', ' ')}`)
  },
  { ...FOLIO, perm: 'recurring.write' },
)

export const cancelPhase = action(
  z.object({ planId: objectId, milestoneId: objectId }),
  async ({ planId, milestoneId }, ctx) => {
    const plan = await loadPlan(ctx, planId)
    const phase = plan.milestones.find((m) => String(m._id) === milestoneId)
    if (!phase) return fail('That phase was not found.')
    if (phase.invoiceId || phase.status !== 'pending') return fail('This phase is already invoiced.')
    await ctx.db(FolioBillingPlan).updateOne({ _id: plan._id, 'milestones._id': phase._id }, { $set: { 'milestones.$.status': 'cancelled' } })
    await audit(ctx, { action: 'plan.phase_cancelled', entity: 'FolioBillingPlan', entityId: plan._id, summary: `Cancelled phase ${phase.name} of ${plan.code}`, product: 'folio' })
    refresh(planId)
    return ok(`Phase "${phase.name}" cancelled`)
  },
  { ...FOLIO, perm: 'recurring.write' },
)
