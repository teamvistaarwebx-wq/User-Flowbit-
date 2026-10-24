import { describe, expect, it, vi } from 'vitest'
import { emailAdapter, type ResendLike } from './channels/email'
import { inappAdapter } from './channels/inapp'
import { whatsappAdapter } from './channels/whatsapp'
import { deliver, type DeliveryPatch, type DeliveryStore } from './deliver'
import type { ChannelAdapter, DeliverableMessage, TimelineEntry } from './types'

const NOW = new Date('2026-10-08T05:00:00Z')

function memoryStore() {
  const saved: Array<{ id: string; patch: DeliveryPatch; entry: TimelineEntry }> = []
  const fallbacks: Array<{ from: string; channel: string; to: readonly string[] }> = []
  const store: DeliveryStore = {
    save: async (id, patch, entry) => {
      saved.push({ id, patch, entry })
    },
    fallback: async (message, channel, to) => {
      fallbacks.push({ from: message.id, channel, to })
      return `fallback-of-${message.id}`
    },
  }
  return { store, saved, fallbacks }
}

const email = (patch: Partial<DeliverableMessage> = {}): DeliverableMessage => ({ id: 'm1', channel: 'email', to: ['asha@example.in'], subject: 'Hi', html: '<p>Hi</p>', attempts: 0, retry: true, ...patch })

const failing = (error: string, extra: { permanent?: boolean } = {}): ChannelAdapter => ({ channel: 'email', send: vi.fn().mockResolvedValue({ ok: false, error, ...extra }) })

describe('deliver', () => {
  it('marks a message sent when the provider accepts it', async () => {
    const { store, saved } = memoryStore()
    const adapter: ChannelAdapter = { channel: 'email', send: vi.fn().mockResolvedValue({ ok: true, provider: 'resend', providerId: 're_1' }) }
    const result = await deliver(email(), { adapters: { email: adapter }, store, now: () => NOW })
    expect(result).toEqual({ status: 'sent', provider: 'resend', providerId: 're_1' })
    expect(saved[0].patch).toMatchObject({ status: 'sent', attempts: 1, providerId: 're_1', sentAt: NOW, nextAttemptAt: null })
  })

  it('queues a failed send for a retry 1 minute later, then 5 minutes, 30 minutes and 2 hours', async () => {
    const delays: number[] = []
    for (const attempts of [0, 1, 2, 3]) {
      const { store } = memoryStore()
      const result = await deliver(email({ attempts }), { adapters: { email: failing('Network down') }, store, now: () => NOW })
      expect(result.status).toBe('queued')
      delays.push((result.nextAttemptAt as Date).getTime() - NOW.getTime())
    }
    expect(delays).toEqual([60_000, 300_000, 1_800_000, 7_200_000])
  })

  it('marks the message failed after the fifth attempt', async () => {
    const { store, saved } = memoryStore()
    const result = await deliver(email({ attempts: 4 }), { adapters: { email: failing('Network down') }, store, now: () => NOW })
    expect(result).toMatchObject({ status: 'failed', error: 'Network down' })
    expect(saved[0].patch).toMatchObject({ status: 'failed', attempts: 5, nextAttemptAt: null })
    expect(saved[0].entry.note).toContain('Attempt 5 failed')
  })

  it('does not retry a permanent error or a single-shot message', async () => {
    const permanent = await deliver(email(), { adapters: { email: failing('Invalid from', { permanent: true }) }, store: memoryStore().store, now: () => NOW })
    expect(permanent.status).toBe('failed')
    const singleShot = await deliver(email({ retry: false }), { adapters: { email: failing('Network down') }, store: memoryStore().store, now: () => NOW })
    expect(singleShot.status).toBe('failed')
  })

  it('treats an adapter that throws as a failed attempt to retry', async () => {
    const adapter: ChannelAdapter = { channel: 'email', send: vi.fn().mockRejectedValue(new Error('socket hang up')) }
    const result = await deliver(email(), { adapters: { email: adapter }, store: memoryStore().store, now: () => NOW, log: vi.fn() })
    expect(result).toMatchObject({ status: 'queued', error: 'socket hang up' })
  })

  it('falls back to email when WhatsApp is not connected and the message allows it', async () => {
    const { store, saved, fallbacks } = memoryStore()
    const message: DeliverableMessage = { ...email(), id: 'w1', channel: 'whatsapp', to: ['+919800000000'], template: 'task_alert', fallback: { channel: 'email', to: ['asha@example.in'] } }
    const result = await deliver(message, { adapters: { whatsapp: whatsappAdapter() }, store, now: () => NOW })
    expect(result).toEqual({ status: 'skipped', skipReason: 'whatsapp_not_connected', error: 'WhatsApp is not connected for this workspace.', fallbackId: 'fallback-of-w1' })
    expect(fallbacks).toEqual([{ from: 'w1', channel: 'email', to: ['asha@example.in'] }])
    expect(saved[0].entry.note).toContain('Sent by email instead')
  })

  it('only skips WhatsApp when the message has no fallback', async () => {
    const { store, fallbacks } = memoryStore()
    const result = await deliver({ ...email(), channel: 'whatsapp', to: ['+919800000000'] }, { adapters: { whatsapp: whatsappAdapter() }, store, now: () => NOW })
    expect(result.status).toBe('skipped')
    expect(result.fallbackId).toBeUndefined()
    expect(fallbacks).toHaveLength(0)
  })

  it('fails permanently when no adapter exists for the channel', async () => {
    const result = await deliver(email(), { adapters: {}, store: memoryStore().store, now: () => NOW })
    expect(result.status).toBe('failed')
  })
})

describe('email adapter (Resend mocked)', () => {
  const resend = (reply: Awaited<ReturnType<ResendLike['emails']['send']>>) => {
    const send = vi.fn().mockResolvedValue(reply)
    return { send, client: () => ({ emails: { send } }) as ResendLike }
  }

  it('sends through the injected client with headers and attachments', async () => {
    const { send, client } = resend({ data: { id: 're_9' }, error: null })
    const adapter = emailAdapter({ apiKey: 're_test', from: 'Flowbit <no-reply@useflowbit.com>', client })
    const result = await adapter.send({ ...email(), headers: { 'List-Unsubscribe': '<https://x/u>' }, attachments: [{ filename: 'invite.ics', content: Buffer.from('ics') }] })
    expect(result).toEqual({ ok: true, provider: 'resend', providerId: 're_9' })
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ to: ['asha@example.in'], headers: { 'List-Unsubscribe': '<https://x/u>' }, attachments: [{ filename: 'invite.ics', content: Buffer.from('ics') }] }))
  })

  it('reports validation errors as permanent and others as retryable', async () => {
    const bad = emailAdapter({ apiKey: 'k', from: 'f', client: resend({ data: null, error: { name: 'validation_error', message: 'Invalid to' } }).client })
    expect(await bad.send(email())).toEqual({ ok: false, error: 'Invalid to', permanent: true })
    const busy = emailAdapter({ apiKey: 'k', from: 'f', client: resend({ data: null, error: { name: 'rate_limit_exceeded', message: 'Slow down' } }).client })
    expect(await busy.send(email())).toEqual({ ok: false, error: 'Slow down', permanent: false })
  })

  it('saves without sending when no API key is set', async () => {
    const { send, client } = resend({ data: { id: 'x' }, error: null })
    const result = await emailAdapter({ apiKey: '', from: 'f', client }).send(email())
    expect(result).toMatchObject({ ok: false, skip: 'no_provider' })
    expect(send).not.toHaveBeenCalled()
  })
})

describe('in-app adapter', () => {
  it('writes one bell row per recipient', async () => {
    const write = vi.fn().mockResolvedValue(undefined)
    const result = await inappAdapter(write).send({ id: 'b1', channel: 'inapp', orgId: 'o1', to: ['u1', 'u2'], title: 'Your morning brief', href: '/app' })
    expect(result).toEqual({ ok: true, provider: 'inapp' })
    expect(write).toHaveBeenCalledWith([
      { orgId: 'o1', userId: 'u1', title: 'Your morning brief', body: undefined, href: '/app', event: undefined },
      { orgId: 'o1', userId: 'u2', title: 'Your morning brief', body: undefined, href: '/app', event: undefined },
    ])
  })
})
