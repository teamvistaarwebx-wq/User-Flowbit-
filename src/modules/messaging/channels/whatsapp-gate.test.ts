import { describe, expect, it, vi } from 'vitest'
import type { ChannelAdapter, OutgoingMessage } from '../types'
import { WHATSAPP_OFF, whatsappFlagGate } from './whatsapp-gate'

const message: OutgoingMessage = { id: 'm1', channel: 'whatsapp', to: ['+919876543210'] }

const fakeAdapter = () => {
  const send = vi.fn<ChannelAdapter['send']>(async () => ({ ok: true, provider: 'fake', providerId: 'wa-1' }))
  return { adapter: { channel: 'whatsapp', send } satisfies ChannelAdapter, send }
}

describe('whatsappFlagGate', () => {
  it('skips the send while WhatsApp is off, so the email fallback goes instead', async () => {
    const { adapter, send } = fakeAdapter()
    const outcome = await whatsappFlagGate(adapter, async () => false).send(message)
    expect(outcome).toEqual(WHATSAPP_OFF)
    expect(outcome).toMatchObject({ ok: false, skip: 'whatsapp_off', permanent: true })
    expect(send).not.toHaveBeenCalled()
  })

  it('passes the send through while WhatsApp is on', async () => {
    const { adapter, send } = fakeAdapter()
    expect(await whatsappFlagGate(adapter, async () => true).send(message)).toEqual({ ok: true, provider: 'fake', providerId: 'wa-1' })
    expect(send).toHaveBeenCalledWith(message)
  })
})
