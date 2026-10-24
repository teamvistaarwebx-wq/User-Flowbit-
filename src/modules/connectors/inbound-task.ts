import 'server-only'
import type { Types } from 'mongoose'
import { z } from 'zod'
import { escapeRegex } from '@/lib/utils'
import { InboundReplay } from '@/models/integrations/InboundReplay'
import { McpIdempotency } from '@/models/mcp/McpIdempotency'
import { Member } from '@/models/Member'
import { User } from '@/models/User'
import { parseWhen } from '@/modules/mcp/dates'
import { priorityOf } from '@/modules/mcp/plan/planner'
import type { TaskPriority } from '@/modules/work/tasks/constants'
import { createTaskRecord } from '@/modules/work/tasks/create'
import { getViewer } from '@/modules/work/tasks/viewer'
import { connectorCtx } from './ctx'
import { replayKeyOf, staleRefusal, type ReplayHeaders } from './inbound-replay'

/**
 * The generic inbound webhook (Zapier, Make, Pabbly) creating a task instead
 * of a lead: `{ "type": "task", "title": …, "assignee_email": …, "due": "kal",
 * "id": "<your record id>" }`. The task is created by the workspace owner as
 * "Webhook". Replays are refused (connectors/inbound-replay): a timestamp
 * must be fresh, and the same `id`, nonce or body never makes a second task,
 * even when two copies arrive at once.
 */

export const inboundTaskSchema = z.object({
  type: z.literal('task'),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).optional(),
  assignee_email: z.string().trim().email().max(200).optional(),
  due: z.string().trim().max(60).optional(),
  priority: z.string().trim().max(20).optional(),
  id: z.string().trim().max(200).optional(),
  source: z.string().trim().max(80).optional(),
})

export type InboundTaskOutcome = Readonly<{ status: 'created' | 'duplicate'; taskId: string } | { status: 'refused'; reason: string } | { status: 'stale'; reason: string }>

/** The request as received, for replay checks. */
export type InboundRequest = Readonly<{ raw: string; headers: ReplayHeaders }>

const isDuplicateKey = (error: unknown) => (error as { code?: number } | null)?.code === 11000

export async function createInboundTask(orgId: Types.ObjectId, body: unknown, request: InboundRequest): Promise<InboundTaskOutcome> {
  const stale = staleRefusal(request.headers)
  if (stale) return { status: 'stale', reason: stale }
  const parsed = inboundTaskSchema.safeParse(body)
  if (!parsed.success) return { status: 'refused', reason: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') }
  const p = parsed.data
  const label = p.source ? `Webhook (${p.source})` : 'Webhook'
  const ctx = await connectorCtx(orgId, { owner: true }, label)
  if (!ctx) return { status: 'refused', reason: 'This workspace has no active owner.' }
  if (!ctx.has('work')) return { status: 'refused', reason: 'Work is not on for this workspace.' }
  if (ctx.entitlements.readOnly) return { status: 'refused', reason: ctx.entitlements.readOnlyMessage }
  if (p.id) {
    // Tasks made before the replay table remembered their id here.
    const seen = await ctx.db(McpIdempotency).findOne({ key: `webhook:${p.id}` }).lean()
    if (seen) return { status: 'duplicate', taskId: String(seen.recordId) }
  }
  let assigneeIds: string[] | undefined
  if (p.assignee_email) {
    const user = await User.findOne({ email: new RegExp(`^${escapeRegex(p.assignee_email)}$`, 'i') }, { _id: 1 }).lean()
    const member = user ? await ctx.db(Member).findOne({ userId: user._id, status: 'active' }, { _id: 1 }).lean() : null
    if (!member) return { status: 'refused', reason: `${p.assignee_email} is not an active member of this workspace.` }
    assigneeIds = [String(member._id)]
  }
  const due = p.due ? parseWhen(p.due) : null
  if (p.due && !due) return { status: 'refused', reason: `Could not read the date "${p.due}".` }
  const replay = replayKeyOf(request.raw, request.headers, p.id)
  try {
    await ctx.db(InboundReplay).create({ key: replay.key, expiresAt: new Date(Date.now() + replay.keepMs) })
  } catch (error) {
    if (!isDuplicateKey(error)) throw error
    const seen = await ctx.db(InboundReplay).findOne({ key: replay.key }, { recordId: 1 }).lean()
    return { status: 'duplicate', taskId: seen?.recordId ? String(seen.recordId) : '' }
  }
  const task = await createTaskRecord(ctx, await getViewer(ctx), {
    title: p.title,
    description: p.description,
    assigneeIds,
    dueDate: due?.date,
    dueTime: due?.time ?? undefined,
    priority: (priorityOf(p.priority) ?? 'medium') as TaskPriority,
    origin: { kind: 'webhook', ref: p.id, label },
  }).catch(async (error: unknown) => {
    // Nothing was made: let the sender retry the same request.
    await ctx.db(InboundReplay).deleteOne({ key: replay.key })
    throw error
  })
  await ctx.db(InboundReplay).updateOne({ key: replay.key }, { $set: { recordId: task._id } })
  return { status: 'created', taskId: String(task._id) }
}
