import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
const env = { ANTHROPIC_API_KEY: 'sk-test' }
vi.mock('@/lib/env', () => ({ serverEnv: () => env }))

const create = vi.fn()
const betaCreate = vi.fn()
vi.mock('@anthropic-ai/sdk', () => {
  class APIError extends Error { status?: number }
  class RateLimitError extends APIError {}
  class AuthenticationError extends APIError {}
  class APIConnectionError extends Error {}
  class Anthropic {
    static APIError = APIError
    static RateLimitError = RateLimitError
    static AuthenticationError = AuthenticationError
    static APIConnectionError = APIConnectionError
    messages = { create }
    beta = { messages: { create: betaCreate } }
  }
  return { default: Anthropic }
})

const reply = (text: string, stop = 'end_turn') => ({ model: 'm', stop_reason: stop, content: [{ type: 'text', text }], usage: { input_tokens: 120, output_tokens: 30 } })

describe('callClaude', () => {
  beforeEach(() => {
    create.mockReset()
    betaCreate.mockReset()
    env.ANTHROPIC_API_KEY = 'sk-test'
  })

  it('drafts on Sonnet with the server-side refusal fallback', async () => {
    betaCreate.mockResolvedValue(reply('{"a":1}'))
    const { callClaude } = await import('./ai-client')
    const out = await callClaude({ tier: 'draft', system: 's', prompt: 'p', maxTokens: 100 })
    expect(out).toEqual({ ok: true, text: '{"a":1}', model: 'm', inputTokens: 120, outputTokens: 30 })
    expect(betaCreate).toHaveBeenCalledWith(expect.objectContaining({ model: 'claude-sonnet-5-5', max_tokens: 100, fallbacks: 'default', betas: ['server-side-fallback-2026-07-01'] }))
    expect(create).not.toHaveBeenCalled()
  })

  it('summarises on Haiku 4.5 without beta options', async () => {
    create.mockResolvedValue(reply('Short update'))
    const { callClaude } = await import('./ai-client')
    await callClaude({ tier: 'cheap', system: 's', prompt: 'p', maxTokens: 100 })
    const params = create.mock.calls[0][0]
    expect(params.model).toBe('claude-haiku-4-5-20251001')
    expect(params).not.toHaveProperty('betas')
    expect(params).not.toHaveProperty('output_config')
  })

  it('treats a refusal or an error as a miss, keeping the tokens', async () => {
    const { callClaude } = await import('./ai-client')
    create.mockResolvedValue(reply('', 'refusal'))
    expect(await callClaude({ tier: 'cheap', system: 's', prompt: 'p', maxTokens: 10 })).toMatchObject({ ok: false, error: 'refused', inputTokens: 120 })
    create.mockRejectedValue(new Error('boom'))
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await callClaude({ tier: 'cheap', system: 's', prompt: 'p', maxTokens: 10 })).toMatchObject({ ok: false, error: 'boom' })
    spy.mockRestore()
  })

  it('makes no call without a key', async () => {
    env.ANTHROPIC_API_KEY = ''
    const { callClaude } = await import('./ai-client')
    expect(await callClaude({ tier: 'draft', system: 's', prompt: 'p', maxTokens: 10 })).toMatchObject({ ok: false, error: 'no API key' })
    expect(betaCreate).not.toHaveBeenCalled()
  })
})
