import 'server-only'
import type { z } from 'zod'
import { redactSensitive } from '@/lib/ai-redact'
import { aiBlockReason } from '@/lib/ai-caps'
import { isAnthropicConfigured } from '@/lib/env'
import type { AiTask } from '@/models/work/AiUsage'
import { callClaude, type AiTier } from './ai-client'
import { aiAllowanceFor, recordAiUsage, type AiCtx } from './usage'

export { ARC_MODELS } from './ai-client'

export const aiEnabled = () => isAnthropicConfigured()

/** Why Arc used a template: no key on the server, no AI on this plan, the monthly cap reached, or the call failed. */
export type AiMiss = 'off' | 'plan' | 'cap' | 'failed'
export type AiOutcome<T> = { ok: true; value: T } | { ok: false; reason: AiMiss }

export type AskInput = Readonly<{ task: AiTask; tier: AiTier; system: string; prompt: string; maxTokens?: number }>

const DEFAULT_MAX_TOKENS = 4000

/**
 * One AI request for this workspace: checks the key and the monthly cap,
 * strips salary, bank and PAN details, calls Claude and logs the tokens.
 * A miss tells the caller to use its template.
 */
export async function askClaude(ctx: AiCtx, input: AskInput, opts: { retry?: boolean } = {}): Promise<AiOutcome<string>> {
  if (!aiEnabled()) return { ok: false, reason: 'off' }
  // A retry belongs to a request already let through: no second cap check, and it is not counted.
  const blocked = opts.retry ? null : aiBlockReason(await aiAllowanceFor(ctx))
  if (blocked) return { ok: false, reason: blocked }
  const reply = await callClaude({ tier: input.tier, system: redactSensitive(input.system), prompt: redactSensitive(input.prompt), maxTokens: input.maxTokens ?? DEFAULT_MAX_TOKENS })
  if (opts.retry) await recordAiUsage(ctx, input.task, reply, { retry: true })
  else await recordAiUsage(ctx, input.task, reply)
  return reply.ok ? { ok: true, value: reply.text } : { ok: false, reason: 'failed' }
}

/** Pulls the first JSON object out of a reply (models sometimes wrap it in a code fence). */
export function extractJson(text: string): unknown {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    return JSON.parse(text.slice(start, end + 1))
  } catch {
    return null
  }
}

const RETRY_NOTE = '\n\nYour last reply was not valid JSON for the schema. Reply with only the JSON object.'

/** Asks for JSON matching `schema`; retries once on invalid output (one request towards the cap). */
export async function askClaudeJson<S extends z.ZodType>(ctx: AiCtx, schema: S, input: AskInput): Promise<AiOutcome<z.output<S>>> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const reply = attempt ? await askClaude(ctx, { ...input, prompt: `${input.prompt}${RETRY_NOTE}` }, { retry: true }) : await askClaude(ctx, input)
    if (!reply.ok) return reply
    const parsed = schema.safeParse(extractJson(reply.value))
    if (parsed.success) return { ok: true, value: parsed.data }
  }
  return { ok: false, reason: 'failed' }
}
