import 'server-only'
import { randomBytes } from 'node:crypto'
import { Types } from 'mongoose'
import { audit } from '@/lib/audit'
import type { Ctx } from '@/lib/ctx'
import { todayIST } from '@/lib/dates'
import { NotFoundError, UserError } from '@/lib/errors'
import { ImportBatch } from '@/models/imports/ImportBatch'
import { McpIdempotency } from '@/models/mcp/McpIdempotency'
import { McpPlan } from '@/models/mcp/McpPlan'
import { undoBatch, undoRefusal, undoUntilFrom } from '@/modules/imports/batch'
import { mongoUndoStore } from '@/modules/imports/batch-store'
import type { Created, Restore } from '@/modules/imports/types'
import { draftInvoiceMcp, draftQuoteMcp, type DocPayload } from '../apply/folio'
import { logActivityMcp, moveDealMcp, scheduleFollowupMcp, upsertLeadMcp, type ActivityPayload, type DealMovePayload, type FollowupPayload, type LeadPayload } from '../apply/orbit'
import { mergeUndo, type ExecResult } from '../apply/types'
import { commentTaskMcp, createTaskMcp, updateTaskMcp, type NewTaskPayload, type TaskUpdatePayload } from '../apply/work'
import { writeRefusal, type LimitStore } from '../limits'
import type { McpSession } from '../session'
import { undoAccessRefusal, type Access } from '../rules'
import { buildAccess } from '../tools/access'
import { planLookups } from './lookups'
import { PENDING_PREFIX, planChanges, previewOf, sourceLabel, type PlanItem, type PlanPreview } from './planner'
import { PLAN_TTL_MS, type PlanOp, type Source } from './schema'

/** Plan → apply → undo for MCP (docs/specs/mcp.md A2), stored as an ImportBatch of kind 'mcp'. */

type Payload = Record<string, unknown>
type Executor = (ctx: Ctx, payload: Payload, via: string) => Promise<ExecResult>

const EXECUTORS: Readonly<Record<PlanOp, Executor>> = {
  create_task: (ctx, p, via) => createTaskMcp(ctx, p as unknown as NewTaskPayload, via),
  update_task: (ctx, p, via) => updateTaskMcp(ctx, p as unknown as TaskUpdatePayload, via),
  add_comment: (ctx, p, via) => commentTaskMcp(ctx, p as unknown as { taskId: string; body: string }, via),
  upsert_lead: (ctx, p, via) => upsertLeadMcp(ctx, p as unknown as LeadPayload, via),
  log_activity: (ctx, p, via) => logActivityMcp(ctx, p as unknown as ActivityPayload, via),
  schedule_followup: (ctx, p, via) => scheduleFollowupMcp(ctx, p as unknown as FollowupPayload, via),
  move_deal: (ctx, p, via) => moveDealMcp(ctx, p as unknown as DealMovePayload, via),
  draft_invoice: (ctx, p, via) => draftInvoiceMcp(ctx, p as unknown as DocPayload, via),
  draft_quote: (ctx, p, via) => draftQuoteMcp(ctx, p as unknown as DocPayload, via),
}

export const runExecutor = (op: PlanOp, ctx: Ctx, payload: Payload, via: string) => EXECUTORS[op](ctx, payload, via)

export type SavedPlan = PlanPreview & Readonly<{ plan_id: string | null; expires_at: string | null; next_step: string }>

/** Checks every change and stores the preview for 30 minutes. Writes nothing else. */
export async function planForSession(session: McpSession, changes: readonly Record<string, unknown>[], source: Source | undefined, now: Date = new Date()): Promise<SavedPlan> {
  const { ctx } = session
  const items = await planChanges(changes, source, { lookups: planLookups(ctx), access: buildAccess(session), now, today: todayIST(now), memberId: String(ctx.memberId) })
  const preview = previewOf(items)
  const runnable = items.filter((i) => i.status !== 'refused' && !i.already)
  if (!runnable.length) return { ...preview, plan_id: null, expires_at: null, next_step: 'Nothing can be applied. Fix the refused changes and plan again.' }
  const planId = `pln_${randomBytes(16).toString('base64url')}`
  const expiresAt = new Date(now.getTime() + PLAN_TTL_MS)
  await ctx.db(McpPlan).create({ planId, grantId: new Types.ObjectId(session.grantId), memberId: ctx.memberId, clientName: session.clientName, source: source ?? null, items, expiresAt })
  const confirm = preview.needs_confirmation.map((i) => i.index)
  return {
    ...preview,
    plan_id: planId,
    expires_at: expiresAt.toISOString(),
    next_step: `Show this preview to the person. Only after they say yes, call flowbit_apply_plan with plan_id${confirm.length ? ` and confirm: [${confirm.join(', ')}] for the needs-confirmation items they approved` : ''}.`,
  }
}

export type AppliedLine = Readonly<{ index: number; op: string; status: 'done' | 'skipped' | 'failed'; summary: string; link?: string; error?: string }>
export type ApplyResult = Readonly<{ batch_id: string | null; applied: number; skipped: number; failed: number; lines: AppliedLine[]; undo: string }>

const resolvePending = (payload: Payload, done: ReadonlyMap<number, string>): Payload | string => {
  const out: Payload = { ...payload }
  for (const [k, v] of Object.entries(payload)) {
    if (typeof v !== 'string' || !v.startsWith(PENDING_PREFIX)) continue
    const id = done.get(Number(v.slice(PENDING_PREFIX.length)))
    if (!id) return `It needs the record from change ${Number(v.slice(PENDING_PREFIX.length)) + 1}, which was not applied.`
    out[k] = id
  }
  return out
}

async function claimPlan(ctx: Ctx, session: McpSession, planId: string, now: Date) {
  const plan = await ctx.db(McpPlan).findOne({ planId }).lean()
  if (!plan) throw new NotFoundError('That plan')
  if (String(plan.memberId) !== String(ctx.memberId) || String(plan.grantId) !== session.grantId) throw new UserError('This plan was made by another connection. Plan again.')
  if (plan.appliedAt) throw new UserError('This plan was already applied.')
  if (new Date(plan.expiresAt).getTime() <= now.getTime()) throw new UserError('This plan expired (plans last 30 minutes). Plan again.')
  const claimed = await ctx.db(McpPlan).updateOne({ _id: plan._id, appliedAt: null }, { $set: { appliedAt: now } })
  if (!claimed.modifiedCount) throw new UserError('This plan was already applied.')
  return plan
}

async function execute(session: McpSession, items: readonly PlanItem[], runnable: ReadonlySet<number>) {
  const done = new Map<number, string>()
  const results: { item: PlanItem; result: ExecResult }[] = []
  const lines: AppliedLine[] = []
  for (const item of items) {
    if (!runnable.has(item.index)) {
      lines.push({ index: item.index, op: item.op, status: 'skipped', summary: item.summary, ...(item.already ? { link: item.already.link } : {}), error: item.status === 'refused' ? item.notes[0] : item.already ? 'Already done from this source' : item.status === 'confirm' ? 'Not confirmed' : undefined })
      continue
    }
    const payload = resolvePending(item.payload ?? {}, done)
    if (typeof payload === 'string') {
      lines.push({ index: item.index, op: item.op, status: 'failed', summary: item.summary, error: payload })
      continue
    }
    try {
      const result = await runExecutor(item.op as PlanOp, session.ctx, payload, session.ctx.user.name)
      done.set(item.index, result.id)
      results.push({ item, result })
      lines.push({ index: item.index, op: item.op, status: 'done', summary: item.summary, link: result.link })
    } catch (error) {
      const message = error instanceof UserError ? error.message : 'Something went wrong on our side.'
      if (!(error instanceof UserError)) console.error('[mcp] apply failed', item.op, error)
      lines.push({ index: item.index, op: item.op, status: 'failed', summary: item.summary, error: message })
    }
  }
  return { results, lines }
}

async function recordMcpBatch(session: McpSession, label: string, items: readonly PlanItem[], results: { item: PlanItem; result: ExecResult }[], lines: readonly AppliedLine[]): Promise<Types.ObjectId> {
  const { ctx } = session
  const undo = mergeUndo(results.map((r) => r.result))
  const batch = await ctx.db(ImportBatch).create({
    kind: 'mcp', label, fileName: '', source: 'mcp', actorUserId: ctx.userId, actorName: ctx.user.name, clientName: session.clientName, grantId: new Types.ObjectId(session.grantId),
    rows: items.length, imported: results.length, skipped: items.length - results.length, created: undo.created.filter((c) => c.ids.length), restore: undo.restore.filter((r) => r.docs.length),
    undoUntil: undoUntilFrom(new Date()), lines: lines.map((l) => ({ op: l.op, summary: l.summary, status: l.status, link: l.link, error: l.error })),
  })
  const keyed = results.filter((r) => r.item.idempotencyKey)
  for (const { item, result } of keyed) {
    await ctx.db(McpIdempotency).create({ key: item.idempotencyKey ?? undefined, model: result.model, recordId: new Types.ObjectId(result.id), label: result.label, batchId: batch._id }).catch((error: { code?: number }) => {
      if (error?.code !== 11000) throw error
    })
  }
  return batch._id
}

/** Applies a confirmed plan as one batch (undo for 7 days). Needs-confirmation items run only when listed in `confirm`. */
export async function applyPlan(session: McpSession, planId: string, confirm: readonly number[], limits: LimitStore, now: Date = new Date()): Promise<ApplyResult> {
  const { ctx } = session
  ctx.assertWritable()
  const plan = await claimPlan(ctx, session, planId, now)
  const items = plan.items as PlanItem[]
  const runnable = new Set(items.filter((i) => !i.already && (i.status === 'ok' || (i.status === 'confirm' && confirm.includes(i.index)))).map((i) => i.index))
  const refusal = await writeRefusal(limits, String(ctx.orgId), runnable.size, now)
  if (refusal) {
    await ctx.db(McpPlan).updateOne({ _id: plan._id }, { $set: { appliedAt: null } })
    throw new UserError(refusal)
  }
  const { results, lines } = await execute(session, items, runnable)
  const failed = lines.filter((l) => l.status === 'failed').length
  if (!results.length) {
    // Nothing changed, so the plan can be fixed and applied again (it is not "already applied").
    await ctx.db(McpPlan).updateOne({ _id: plan._id }, { $set: { appliedAt: null } })
    return { batch_id: null, applied: 0, skipped: lines.length - failed, failed, lines, undo: 'Nothing was changed.' }
  }
  const label = `${session.clientName}: ${sourceLabel(plan.source as Source | undefined) ?? 'changes'}`
  const batchId = await recordMcpBatch(session, label, items, results, lines)
  await ctx.db(McpPlan).updateOne({ _id: plan._id }, { $set: { batchId } })
  await audit(ctx, { action: 'mcp.batch.applied', entity: 'ImportBatch', entityId: batchId, summary: `Applied ${results.length} ${results.length === 1 ? 'change' : 'changes'} from ${label}`, meta: { planId, failed, client: session.clientName } })
  return { batch_id: String(batchId), applied: results.length, skipped: lines.filter((l) => l.status === 'skipped').length, failed, lines, undo: 'Undo within 7 days with flowbit_undo_batch, or in Flowbit: Settings → Connected apps → History.' }
}

/** One single-tool write recorded as its own batch, so it shows in History and can be undone too. */
export async function recordSingle(session: McpSession, op: string, summary: string, result: ExecResult, idempotencyKey: string | null = null): Promise<string> {
  const item: PlanItem = { index: 0, op, status: 'ok', summary, notes: [], payload: null, idempotencyKey, already: null }
  const id = await recordMcpBatch(session, `${session.clientName}: ${summary}`.slice(0, 200), [item], [{ item, result }], [{ index: 0, op, status: 'done', summary, link: result.link }])
  return String(id)
}

export type UndoResult = Readonly<{ label: string; removed: number; restored: number; kept: number }>

/** Undoes an MCP batch within 7 days: removes what it created (drafts only while still drafts) and puts back what it changed. */
export async function undoMcpBatch(ctx: Ctx, batchId: string, by: string, opts: { onlyMemberUserId?: Types.ObjectId; access?: { check: Access; grantId: string } } = {}): Promise<UndoResult> {
  if (!Types.ObjectId.isValid(batchId)) throw new NotFoundError('That batch')
  const batch = await ctx.db(ImportBatch).findOne({ _id: batchId, kind: 'mcp' }).lean()
  if (!batch) throw new NotFoundError('That batch')
  if (opts.onlyMemberUserId && String(batch.actorUserId) !== String(opts.onlyMemberUserId)) throw new UserError('Only the person who applied this batch, or an admin in Flowbit, can undo it.')
  if (opts.access) {
    const models = [...((batch.created ?? []) as { model: string }[]), ...((batch.restore ?? []) as { model: string }[])].map((g) => g.model)
    const denied = undoAccessRefusal(opts.access.check, { grantId: batch.grantId, models }, opts.access.grantId)
    if (denied) throw new UserError(denied)
  }
  ctx.assertWritable()
  const refusal = undoRefusal(batch)
  if (refusal) throw new UserError(refusal.replace('import', 'batch').replace('Imports', 'Batches'))
  const claimed = await ctx.db(ImportBatch).updateOne({ _id: batch._id, status: 'done' }, { $set: { status: 'undone', undoneAt: new Date(), undoneBy: by } })
  if (!claimed.modifiedCount) throw new UserError('This batch was already undone.')
  const created = batch.created as unknown as Created
  const restore = (batch.restore ?? []) as unknown as Restore
  const result = await undoBatch(mongoUndoStore, { orgId: batch.orgId, status: 'done', undoUntil: batch.undoUntil, created, restore })
  await ctx.db(McpIdempotency).deleteMany({ batchId: batch._id })
  const total = created.reduce((n, g) => n + g.ids.length, 0)
  const kept = Math.max(0, total - result.deleted)
  await audit(ctx, { action: 'mcp.batch.undone', entity: 'ImportBatch', entityId: batch._id, summary: `Undid ${batch.label} (${result.deleted} removed, ${result.restored} put back${kept ? `, ${kept} kept` : ''})`, meta: { client: batch.clientName } })
  return { label: batch.label, removed: result.deleted, restored: result.restored, kept }
}
