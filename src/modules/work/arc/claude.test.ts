import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

vi.mock('server-only', () => ({}))
const state = { key: true, allowed: true, cap: 50 }
vi.mock('@/lib/env', () => ({ isAnthropicConfigured: () => state.key }))
const callClaude = vi.fn()
vi.mock('./ai-client', () => ({ callClaude: (...args: unknown[]) => callClaude(...args), ARC_MODELS: {} }))
const recordAiUsage = vi.fn()
const allowanceCalls = vi.fn()
vi.mock('./usage', () => ({ aiAllowanceFor: async () => {
    allowanceCalls()
    return { allowed: state.allowed, cap: state.cap }
  }, recordAiUsage: (...args: unknown[]) => recordAiUsage(...args) }))

const ctx = {} as never
const ask = { task: 'outline', tier: 'draft', system: 'sys', prompt: 'p' } as const
const ok = (text: string) => ({ ok: true, text, model: 'm', inputTokens: 1, outputTokens: 1 })

describe('askClaude', () => {
  beforeEach(() => {
    state.key = true
    state.allowed = true
    state.cap = 50
    callClaude.mockReset()
    recordAiUsage.mockReset()
    allowanceCalls.mockReset()
  })

  it('reads JSON inside a code fence and rejects junk', async () => {
    const { extractJson } = await import('./claude')
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 })
    expect(extractJson('no json here')).toBeNull()
  })

  it('uses templates without an API key, and makes no call', async () => {
    state.key = false
    const { askClaude } = await import('./claude')
    await expect(askClaude(ctx, ask)).resolves.toEqual({ ok: false, reason: 'off' })
    expect(callClaude).not.toHaveBeenCalled()
  })

  it('stops at the monthly cap', async () => {
    state.allowed = false
    const { askClaude } = await import('./claude')
    await expect(askClaude(ctx, ask)).resolves.toEqual({ ok: false, reason: 'cap' })
    expect(callClaude).not.toHaveBeenCalled()
  })

  it('says the plan has no AI when the cap is 0, not that the month is used up', async () => {
    state.allowed = false
    state.cap = 0
    const { askClaude } = await import('./claude')
    await expect(askClaude(ctx, ask)).resolves.toEqual({ ok: false, reason: 'plan' })
    expect(callClaude).not.toHaveBeenCalled()
  })

  it('never sends salary, bank or PAN details, and logs the tokens', async () => {
    callClaude.mockResolvedValue(ok('done'))
    const { askClaude } = await import('./claude')
    const out = await askClaude(ctx, { ...ask, prompt: 'Raise CTC to ₹9,00,000; PAN ABCDE1234F; A/c 123456789012' })
    expect(out).toEqual({ ok: true, value: 'done' })
    const sent = callClaude.mock.calls[0][0].prompt as string
    expect(sent).not.toMatch(/9,00,000|ABCDE1234F|123456789012/)
    expect(recordAiUsage).toHaveBeenCalledWith(ctx, 'outline', expect.objectContaining({ ok: true }))
  })

  it('retries once on invalid JSON, then falls back', async () => {
    callClaude.mockResolvedValueOnce(ok('nope')).mockResolvedValueOnce(ok('{"n":2}'))
    const { askClaudeJson } = await import('./claude')
    await expect(askClaudeJson(ctx, z.object({ n: z.number() }), ask)).resolves.toEqual({ ok: true, value: { n: 2 } })
    callClaude.mockResolvedValue(ok('still nope'))
    await expect(askClaudeJson(ctx, z.object({ n: z.number() }), ask)).resolves.toEqual({ ok: false, reason: 'failed' })
  })

  it('counts a JSON retry as part of the same request (QA 10.2)', async () => {
    callClaude.mockResolvedValueOnce(ok('nope')).mockResolvedValueOnce(ok('{"n":2}'))
    const { askClaudeJson } = await import('./claude')
    await askClaudeJson(ctx, z.object({ n: z.number() }), ask)
    expect(allowanceCalls).toHaveBeenCalledTimes(1)
    expect(recordAiUsage).toHaveBeenCalledTimes(2)
    expect(recordAiUsage.mock.calls[0][3]).toBeUndefined()
    expect(recordAiUsage.mock.calls[1][3]).toEqual({ retry: true })
  })
})
