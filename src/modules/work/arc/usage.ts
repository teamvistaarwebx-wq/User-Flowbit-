import 'server-only'
import type { Ctx } from '@/lib/ctx'
import { aiAllowance, aiMonthIST, DEFAULT_AI_CAPS, type AiAllowance, type AiCaps } from '@/lib/ai-caps'
import { AiUsage, type AiTask } from '@/models/work/AiUsage'
import { consoleSettings } from '@/modules/console/settings-query'
import type { AiReply } from './ai-client'

/** The workspace's monthly Arc AI cap and what it has used (Console → Settings → Arc AI). */

export type AiCtx = Pick<Ctx, 'db' | 'memberId' | 'entitlements'>

async function caps(): Promise<AiCaps> {
  try {
    return (await consoleSettings()).ai.caps
  } catch (error) {
    console.error('[arc] Console settings unreadable; using the default AI caps', error)
    return DEFAULT_AI_CAPS
  }
}

export async function aiAllowanceFor(ctx: AiCtx, at: Date = new Date()): Promise<AiAllowance> {
  const cap = (await caps())[ctx.entitlements.accountType] ?? 0
  // One request per user action: JSON retries are logged but not counted.
  const used = await ctx.db(AiUsage).countDocuments({ month: aiMonthIST(at), retry: { $ne: true } })
  return aiAllowance(cap, used)
}

/** Logs one provider call with its tokens. A logging failure never fails the draft. */
export async function recordAiUsage(ctx: AiCtx, task: AiTask, reply: AiReply, opts: { retry?: boolean } = {}): Promise<void> {
  try {
    await ctx.db(AiUsage).create({ memberId: ctx.memberId, task, model: reply.model, month: aiMonthIST(), inputTokens: reply.inputTokens, outputTokens: reply.outputTokens, ok: reply.ok, retry: Boolean(opts.retry) })
  } catch (error) {
    console.error('[arc] could not record AI usage', error)
  }
}

/** Tokens this month, for Settings. */
export async function aiTokensThisMonth(ctx: Pick<Ctx, 'db'>): Promise<{ input: number; output: number }> {
  const [row] = await ctx.db(AiUsage).aggregate<{ input: number; output: number }>([
    { $match: { month: aiMonthIST() } },
    { $group: { _id: null, input: { $sum: '$inputTokens' }, output: { $sum: '$outputTokens' } } },
  ])
  return { input: row?.input ?? 0, output: row?.output ?? 0 }
}
