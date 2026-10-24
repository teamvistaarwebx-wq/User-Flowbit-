import 'server-only'
import { serverEnv } from '@/lib/env'
import { fetchWithTimeout } from '@/lib/fetch-timeout'
import { whatsappAdapter } from '@/modules/messaging/channels/whatsapp'
import type { ChannelAdapter } from '@/modules/messaging/types'
import type { FetchLike } from '@/modules/payments/razorpay-links'
import { consoleSettings } from '@/modules/console/settings-query'
import { interaktProvider, senderFor } from './interakt'
import { messageCostPaise } from './templates'

/**
 * The live WhatsApp channel for WhatsApp A (Flowbit's own numbers): picks the
 * OTP or the messages Interakt account per message and prices each send from
 * the Console rate card. No key: the send is skipped as "not connected" and
 * the pipeline falls back to email where the message allows it.
 */

/** Interakt and IndiaMART calls: no cache, and a timeout so one slow provider cannot hold a cron run. */
export const liveFetch: FetchLike = (url, init) => fetchWithTimeout(url, { ...init, cache: 'no-store' })

export const interaktKeys = () => {
  const env = serverEnv()
  return { messages: env.INTERAKT_API_KEY, otp: env.INTERAKT_OTP_API_KEY }
}

export const isWhatsAppConfigured = (): boolean => Boolean(serverEnv().INTERAKT_API_KEY)

export function platformWhatsAppAdapter(): ChannelAdapter {
  return {
    channel: 'whatsapp',
    async send(message) {
      const sender = senderFor(message.kind, interaktKeys())
      if (!sender) return whatsappAdapter(null).send(message)
      const { whatsapp } = await consoleSettings()
      const provider = interaktProvider({ ...sender, fetch: liveFetch, costOf: (category) => messageCostPaise(category, whatsapp.rates) })
      return whatsappAdapter(provider).send(message)
    },
  }
}
