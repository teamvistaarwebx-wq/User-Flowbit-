import { describe, expect, it, vi } from 'vitest'
import { cancelPaymentLink, type FetchLike } from '@/modules/payments/razorpay-links'
import { recallProvider } from '@/modules/work/meetings/ai/recall'
import { sarvamProvider } from '@/modules/work/meetings/ai/sarvam'

vi.mock('server-only', () => ({}))

/** R3 M7: every provider client sends an abort signal, so no call can hang for the whole cron run. */
describe('provider clients send a timeout signal', () => {
  it('Razorpay payment links', async () => {
    // Arrange
    const fetchFn = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }))

    // Act
    await cancelPaymentLink(fetchFn as unknown as FetchLike, { keyId: 'k', keySecret: 's' }, 'plink_1')

    // Assert
    const init = (fetchFn.mock.calls[0] as unknown as [string, RequestInit])[1]
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it('Recall', async () => {
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) => new Response('{}'))
    await recallProvider('key', 'us-west-2', fetchImpl).cancel('bot1')
    expect(fetchImpl.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal)
  })

  it('Sarvam', async () => {
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({ job_state: 'Running' })))
    await sarvamProvider('key', fetchImpl).poll('job1')
    expect(fetchImpl.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal)
  })
})
