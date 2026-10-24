import 'server-only'
import Anthropic from '@anthropic-ai/sdk'
import { serverEnv } from '@/lib/env'

/**
 * The only module that talks to the Claude API (official SDK). Tests mock
 * '@anthropic-ai/sdk', so no test ever reaches the network.
 *
 * Two tiers: 'draft' (project outlines, task breakdowns) on Sonnet with the
 * server-side refusal fallback, and 'cheap' (rewording a summary) on Haiku.
 */

export const ARC_MODELS = { draft: 'claude-sonnet-5-5', cheap: 'claude-haiku-4-5-20251001' } as const
export type AiTier = keyof typeof ARC_MODELS

const TIMEOUT_MS = 45_000
const MAX_RETRIES = 1
const FALLBACK_BETA = 'server-side-fallback-2026-07-01'

export type AiCall = Readonly<{ tier: AiTier; system: string; prompt: string; maxTokens: number }>
export type AiReply =
  | { ok: true; text: string; model: string; inputTokens: number; outputTokens: number }
  | { ok: false; model: string; error: string; inputTokens: number; outputTokens: number }

let cached: { key: string; client: Anthropic } | null = null
function client(apiKey: string): Anthropic {
  if (cached?.key !== apiKey) cached = { key: apiKey, client: new Anthropic({ apiKey, timeout: TIMEOUT_MS, maxRetries: MAX_RETRIES }) }
  return cached.client
}

type Block = { type: string; text?: string }
const textOf = (content: readonly Block[]) => content.filter((b) => b.type === 'text' && b.text).map((b) => b.text).join('').trim()

async function send(api: Anthropic, call: AiCall, model: string) {
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: call.prompt }]
  if (call.tier === 'cheap') return api.messages.create({ model, max_tokens: call.maxTokens, system: call.system, messages })
  return api.beta.messages.create({ model, max_tokens: call.maxTokens, system: call.system, messages, output_config: { effort: 'low' }, betas: [FALLBACK_BETA], fallbacks: 'default' })
}

function describe(error: unknown): string {
  if (error instanceof Anthropic.RateLimitError) return 'rate limited'
  if (error instanceof Anthropic.AuthenticationError) return 'API key rejected'
  if (error instanceof Anthropic.APIError) return `API error ${error.status ?? ''}`.trim()
  if (error instanceof Anthropic.APIConnectionError) return 'could not reach the API'
  return error instanceof Error ? error.message : 'unknown error'
}

/** One Messages API call. Never throws: a failure or refusal comes back as `{ ok: false }`. */
export async function callClaude(call: AiCall): Promise<AiReply> {
  const model = ARC_MODELS[call.tier]
  const apiKey = serverEnv().ANTHROPIC_API_KEY
  if (!apiKey) return { ok: false, model, error: 'no API key', inputTokens: 0, outputTokens: 0 }
  try {
    const res = await send(client(apiKey), call, model)
    const usage = { inputTokens: res.usage?.input_tokens ?? 0, outputTokens: res.usage?.output_tokens ?? 0 }
    if (res.stop_reason === 'refusal') return { ok: false, model: res.model ?? model, error: 'refused', ...usage }
    const text = textOf(res.content as readonly Block[])
    return text ? { ok: true, text, model: res.model ?? model, ...usage } : { ok: false, model, error: 'empty reply', ...usage }
  } catch (error) {
    console.error('[arc] Claude request failed:', describe(error))
    return { ok: false, model, error: describe(error), inputTokens: 0, outputTokens: 0 }
  }
}
