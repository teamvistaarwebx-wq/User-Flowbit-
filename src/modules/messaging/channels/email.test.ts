import { describe, expect, it, vi } from 'vitest'
import { emailAdapter, FROM_HEADER } from './email'

describe('email adapter', () => {
  it("sends a stored Reply-To header as Resend's replyTo and keeps the other headers", async () => {
    const send = vi.fn().mockResolvedValue({ data: { id: 'r1' }, error: null })
    const adapter = emailAdapter({ apiKey: 'k', from: 'Flowbit <hi@flowbit.in>', client: () => ({ emails: { send } }) })
    const message = { to: ['asha@kiran.in'], subject: 'Hi', html: '<p>Hi</p>', headers: { 'Reply-To': 'vikram@agency.in', 'List-Unsubscribe': '<https://u>' } }
    await expect(adapter.send(message as never)).resolves.toMatchObject({ ok: true, providerId: 'r1' })
    expect(send.mock.calls[0][0]).toMatchObject({ replyTo: 'vikram@agency.in', headers: { 'List-Unsubscribe': '<https://u>' } })
    expect(send.mock.calls[0][0].headers).not.toHaveProperty('Reply-To')
  })

  it('sends from the workspace domain named in the stored From header, never as a header', async () => {
    const send = vi.fn().mockResolvedValue({ data: { id: 'r2' }, error: null })
    const adapter = emailAdapter({ apiKey: 'k', from: 'Flowbit <hi@flowbit.in>', client: () => ({ emails: { send } }) })
    await adapter.send({ to: ['asha@kiran.in'], subject: 'Invoice', html: '<p>x</p>', headers: { [FROM_HEADER]: 'Bright Foods <billing@brightfoods.in>' } } as never)
    expect(send.mock.calls[0][0].from).toBe('Bright Foods <billing@brightfoods.in>')
    expect(send.mock.calls[0][0].headers).toBeUndefined()
  })

  it('falls back to the default sender when the stored From is malformed', async () => {
    const send = vi.fn().mockResolvedValue({ data: { id: 'r3' }, error: null })
    const adapter = emailAdapter({ apiKey: 'k', from: 'Flowbit <hi@flowbit.in>', client: () => ({ emails: { send } }) })
    await adapter.send({ to: ['asha@kiran.in'], subject: 'Invoice', html: '<p>x</p>', headers: { [FROM_HEADER]: 'Evil\r\nBcc: x@y.z <a@b.c>' } } as never)
    expect(send.mock.calls[0][0].from).toBe('Flowbit <hi@flowbit.in>')
  })

  it('sends a Reply-To list (salesperson and reply inbox) as an array', async () => {
    const send = vi.fn().mockResolvedValue({ data: { id: 'r4' }, error: null })
    const adapter = emailAdapter({ apiKey: 'k', from: 'Flowbit <hi@flowbit.in>', client: () => ({ emails: { send } }) })
    await adapter.send({ to: ['asha@kiran.in'], subject: 'Hi', html: '<p>x</p>', headers: { 'Reply-To': 'vikram@agency.in, replies+vistaar-abc@in.useflowbit.com' } } as never)
    expect(send.mock.calls[0][0].replyTo).toEqual(['vikram@agency.in', 'replies+vistaar-abc@in.useflowbit.com'])
  })
})
