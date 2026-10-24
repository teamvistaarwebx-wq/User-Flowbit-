import type { ChannelAdapter, OutgoingMessage, SendOutcome } from '../types'

/**
 * WhatsApp channel (notifications-v2 §0b.1, §2). WhatsApp A (Flowbit's own
 * numbers, console spec 10) sends through Interakt (modules/whatsapp). Without
 * a provider every send answers "not connected", so the pipeline skips the
 * message and, when the message allows it, sends the email copy instead.
 *
 * TODO(whatsapp B, V2-PLAN step 8): a workspace's own number through the BSP
 * partner plugs in as another `WhatsAppProvider`, reading the workspace's
 * connection and wallet balance before sending.
 */

/** One WhatsApp sender (Interakt, Meta Cloud direct, another BSP); the channel picks the workspace's one. */
export interface WhatsAppProvider {
  readonly name: string
  sendTemplate(message: OutgoingMessage): Promise<SendOutcome>
}

const NOT_CONNECTED: SendOutcome = { ok: false, error: 'WhatsApp is not connected for this workspace.', permanent: true, skip: 'whatsapp_not_connected' }

/** A fixed provider, none, or a pick per message (the OTP number vs the messages number). */
export type ProviderPick = WhatsAppProvider | null | ((message: OutgoingMessage) => WhatsAppProvider | null)

/** The adapter the pipeline uses. Without a provider every send is skipped as "not connected". */
export function whatsappAdapter(pick: ProviderPick = null): ChannelAdapter {
  return {
    channel: 'whatsapp',
    send: async (message) => {
      const provider = typeof pick === 'function' ? pick(message) : pick
      return provider ? provider.sendTemplate(message) : NOT_CONNECTED
    },
  }
}
