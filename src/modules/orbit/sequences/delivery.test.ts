import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
const gmailSend = vi.fn()
vi.mock('@/modules/google/client', () => ({ gmailSend: (...a: unknown[]) => gmailSend(...a) }))
const state: { token: string | null } = { token: null }
vi.mock('@/modules/google/connections', () => ({ accessTokenFor: async () => state.token }))
const enqueue = vi.fn()
vi.mock('@/modules/messaging/send', () => ({
  enqueue: (...a: unknown[]) => enqueue(...a),
  unsubscribeUrl: () => 'https://app.test/unsubscribe/tok',
  unsubscribeHeaders: () => ({ 'List-Unsubscribe': '<https://app.test/api/unsubscribe/tok>', 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' }),
}))

const inbox: { value: string | null } = { value: null }
vi.mock('./replies', () => ({ replyAddressFor: () => inbox.value }))

const mail = { orgId: 'o1', senderId: 'm1', senderEmail: 'vikram@agency.in', to: 'asha@kiran.in', subject: 'Hi Asha', body: 'Hello', leadId: 'l1', enrollmentId: 'e1', stepIndex: 0 } as never

describe('sendSequenceEmail', () => {
  beforeEach(() => {
    gmailSend.mockReset()
    enqueue.mockReset()
    state.token = null
    inbox.value = null
  })

  it("sends from the sender's Gmail with the List-Unsubscribe headers when connected", async () => {
    state.token = 'gtok'
    gmailSend.mockResolvedValue({ id: 'g1' })
    const { sendSequenceEmail } = await import('./delivery')
    await expect(sendSequenceEmail({} as never, mail)).resolves.toEqual({ ok: true, via: 'gmail' })
    const raw = gmailSend.mock.calls[0][1] as string
    expect(gmailSend.mock.calls[0][0]).toBe('gtok')
    expect(raw).toContain('List-Unsubscribe: <https://app.test/api/unsubscribe/tok>')
    expect(raw).toContain('List-Unsubscribe-Post: List-Unsubscribe=One-Click')
    expect(enqueue).not.toHaveBeenCalled()
  })

  it('otherwise sends through Flowbit mail, non-essential, replying to the sender', async () => {
    enqueue.mockResolvedValue({ id: 'x', status: 'sent', ok: true, provider: 'resend' })
    const { sendSequenceEmail } = await import('./delivery')
    await expect(sendSequenceEmail({} as never, mail)).resolves.toEqual({ ok: true, via: 'resend' })
    const input = enqueue.mock.calls[0][0]
    expect(input).toMatchObject({ channel: 'email', to: 'asha@kiran.in', essential: false, kind: 'sequence', dedupeKey: 'seq:e1:0' })
    expect(input.headers).toEqual({ 'List-Unsubscribe': '<https://app.test/api/unsubscribe/tok>', 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click', 'Reply-To': 'vikram@agency.in' })
    expect(input.html).toContain('https://app.test/unsubscribe/tok')
  })

  it('copies the enrolment’s reply address on Reply-To when inbound email is set up, so a reply stops the sequence', async () => {
    inbox.value = 'reply+665f1c2a9d3e4b0012345678-abcdefghijklmnop@in.useflowbit.com'
    enqueue.mockResolvedValue({ id: 'x', status: 'sent', ok: true, provider: 'resend' })
    const { sendSequenceEmail } = await import('./delivery')
    await sendSequenceEmail({} as never, mail)
    expect(enqueue.mock.calls[0][0].headers['Reply-To']).toBe('vikram@agency.in, reply+665f1c2a9d3e4b0012345678-abcdefghijklmnop@in.useflowbit.com')
  })

  it('copies the reply address on Reply-To on the Gmail path too, so a reply there stops the sequence', async () => {
    state.token = 'gtok'
    inbox.value = 'reply+665f1c2a9d3e4b0012345678-abcdefghijklmnop@in.useflowbit.com'
    gmailSend.mockResolvedValue({ id: 'g1' })
    const { sendSequenceEmail } = await import('./delivery')
    await sendSequenceEmail({} as never, mail)
    expect(gmailSend.mock.calls[0][1] as string).toContain('Reply-To: vikram@agency.in, reply+665f1c2a9d3e4b0012345678-abcdefghijklmnop@in.useflowbit.com')
  })

  it('adds no Reply-To on the Gmail path without inbound email (replies reach the sender anyway)', async () => {
    state.token = 'gtok'
    gmailSend.mockResolvedValue({ id: 'g1' })
    const { sendSequenceEmail } = await import('./delivery')
    await sendSequenceEmail({} as never, mail)
    expect(gmailSend.mock.calls[0][1] as string).not.toContain('Reply-To')
  })

  it('keeps the Gmail thread id so replies can be detected', async () => {
    state.token = 'gtok'
    gmailSend.mockResolvedValue({ id: 'g1', threadId: 't1' })
    const { sendSequenceEmail } = await import('./delivery')
    await expect(sendSequenceEmail({} as never, mail)).resolves.toEqual({ ok: true, via: 'gmail', threadId: 't1' })
  })

  it('reports a Gmail failure', async () => {
    state.token = 'gtok'
    gmailSend.mockRejectedValue(new Error('Gmail send failed (403)'))
    const { sendSequenceEmail } = await import('./delivery')
    await expect(sendSequenceEmail({} as never, mail)).resolves.toEqual({ ok: false, via: 'gmail', error: 'Gmail send failed (403)' })
  })
})
