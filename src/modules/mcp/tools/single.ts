import 'server-only'
import { todayIST } from '@/lib/dates'
import { UserError } from '@/lib/errors'
import { writeRefusal, type LimitStore } from '../limits'
import { planLookups } from '../plan/lookups'
import { planOne } from '../plan/planner'
import { recordSingle, runExecutor } from '../plan/run'
import type { PlanOp, Source } from '../plan/schema'
import type { McpSession } from '../session'
import { buildAccess } from './access'

/**
 * One write tool call ("add one task" stays fast): the same resolution and
 * checks as a plan, applied at once when sure. When a name is ambiguous or a
 * duplicate is likely, nothing is written until the AI calls again with
 * `confirm: true` after asking the person. Each write is its own undoable batch.
 */
export async function singleChange(session: McpSession, limits: LimitStore, op: PlanOp, change: Record<string, unknown>, opts: { confirm?: boolean; source?: Source } = {}) {
  const { ctx } = session
  const now = new Date()
  const item = await planOne(0, { ...change, op }, opts.source, { lookups: planLookups(ctx), access: buildAccess(session), now, today: todayIST(now), memberId: String(ctx.memberId) })
  if (item.status === 'refused') throw new UserError(item.notes.join(' '))
  if (item.already) return { status: 'already_done', summary: item.summary, record: item.already, notes: item.notes }
  if (item.status === 'confirm' && !opts.confirm) {
    return { status: 'needs_confirmation', summary: item.summary, notes: item.notes, next_step: 'Nothing was saved. Show this to the person; if they agree call the tool again with confirm: true, or use exact names (flowbit_find).' }
  }
  const refusal = await writeRefusal(limits, String(ctx.orgId), 1, now)
  if (refusal) throw new UserError(refusal)
  const result = await runExecutor(op, ctx, item.payload ?? {}, ctx.user.name)
  const batchId = await recordSingle(session, op, item.summary, result, item.idempotencyKey)
  return { status: 'done', summary: item.summary, record: { id: result.id, label: result.label, link: result.link, action: result.action }, notes: item.notes, batch_id: batchId, undo: 'flowbit_undo_batch with this batch_id within 7 days.' }
}
