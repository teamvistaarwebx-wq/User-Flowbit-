import type { ChannelAdapter, SendOutcome } from '../types'

/** What a WhatsApp send answers while the feature is off: skipped, so the pipeline sends the email copy where it can. */
export const WHATSAPP_OFF: SendOutcome = { ok: false, error: 'WhatsApp is turned off for now.', permanent: true, skip: 'whatsapp_off' }

/** Wraps the WhatsApp adapter: every send is skipped while `isOn` answers false (lib/feature-flags). */
export const whatsappFlagGate = (adapter: ChannelAdapter, isOn: () => Promise<boolean>): ChannelAdapter => ({
  channel: 'whatsapp',
  send: async (message) => ((await isOn()) ? adapter.send(message) : WHATSAPP_OFF),
})
