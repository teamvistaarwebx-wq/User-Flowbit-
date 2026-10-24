import type { WhatsAppProvider } from '@/modules/messaging/channels/whatsapp'
import type { OutgoingMessage, SendOutcome } from '@/modules/messaging/types'
import type { FetchLike } from '@/modules/payments/razorpay-links'
import { splitE164 } from './phone'
import { decodeWaParams, type WaCategory } from './templates'

/**
 * Interakt (BSP, V2-PLAN §7) for WhatsApp A: POST /v1/public/message/ with
 * Basic auth (the API key is already the base64 secret Interakt shows).
 * Template sends carry bodyValues, a PDF document header with fileName, URL
 * button suffixes and callbackData (our Message id, echoed on webhooks).
 * `fetch` is injected: tests never reach the network.
 */

export const INTERAKT_MESSAGE_URL = 'https://api.interakt.ai/v1/public/message/'

export type InteraktTemplatePayload = Readonly<{
  countryCode: string
  phoneNumber: string
  callbackData?: string
  type: 'Template'
  template: Readonly<{
    name: string
    languageCode: string
    bodyValues?: readonly string[]
    headerValues?: readonly string[]
    fileName?: string
    buttonValues?: Readonly<Record<string, readonly string[]>>
    /** Quick-reply payloads by button index (Interakt `buttonPayload`; beta: confirm the shape with a real account). */
    buttonPayload?: Readonly<Record<string, readonly string[]>>
  }>
}>

export type InteraktTextPayload = Readonly<{ countryCode: string; phoneNumber: string; callbackData?: string; type: 'Text'; data: Readonly<{ message: string }> }>

/** The template-send body for one recipient (E.164) from a stored message. */
export function interaktTemplatePayload(input: { to: string; template: string; params?: Readonly<Record<string, string>>; callbackData?: string }): InteraktTemplatePayload {
  const decoded = decodeWaParams(input.params)
  return {
    ...splitE164(input.to),
    ...(input.callbackData ? { callbackData: input.callbackData } : {}),
    type: 'Template',
    template: {
      name: input.template,
      languageCode: decoded.language,
      ...(decoded.bodyValues.length ? { bodyValues: decoded.bodyValues } : {}),
      ...(decoded.headerUrl ? { headerValues: [decoded.headerUrl], fileName: decoded.fileName } : {}),
      ...(decoded.buttonValue ? { buttonValues: { '0': [decoded.buttonValue] } } : {}),
      ...(decoded.quickReplies ? { buttonPayload: Object.fromEntries(Object.entries(decoded.quickReplies).map(([index, payload]) => [index, [payload]])) } : {}),
    },
  }
}

/** A free-text (session) reply: allowed only inside 24 hours of the person's last message. */
export const interaktTextPayload = (input: { to: string; text: string; callbackData?: string }): InteraktTextPayload => ({
  ...splitE164(input.to),
  ...(input.callbackData ? { callbackData: input.callbackData } : {}),
  type: 'Text',
  data: { message: input.text },
})

export type InteraktResult = Readonly<{ ok: true; id: string } | { ok: false; error: string; permanent: boolean }>

/** HTTP errors that fail the same way on every retry (bad key, unknown template, bad number, empty wallet). */
const isPermanent = (status: number) => status >= 400 && status < 500 && status !== 408 && status !== 429

export async function postToInterakt(fetchFn: FetchLike, apiKey: string, payload: InteraktTemplatePayload | InteraktTextPayload): Promise<InteraktResult> {
  let res: Awaited<ReturnType<FetchLike>>
  try {
    res = await fetchFn(INTERAKT_MESSAGE_URL, {
      method: 'POST',
      headers: { authorization: `Basic ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Interakt could not be reached.', permanent: false }
  }
  const json = ((await res.json().catch(() => ({}))) ?? {}) as { result?: boolean; id?: string; message?: string }
  if (res.ok && json.result !== false && json.id) return { ok: true, id: json.id }
  const error = json.message ?? `Interakt answered HTTP ${res.status}`
  return { ok: false, error, permanent: res.ok ? true : isPermanent(res.status) }
}

export type InteraktProviderOptions = Readonly<{
  /** 'interakt' (messages) or 'interakt-otp': two Interakt accounts, two numbers. */
  name: string
  apiKey: string
  fetch: FetchLike
  /** Paise per message for a category (Console rate card). */
  costOf: (category: WaCategory) => number
}>

export function interaktProvider(options: InteraktProviderOptions): WhatsAppProvider {
  return {
    name: options.name,
    async sendTemplate(message: OutgoingMessage): Promise<SendOutcome> {
      const to = message.to[0]
      if (!to) return { ok: false, error: 'No WhatsApp number.', permanent: true, skip: 'no_address' }
      if (!message.template) return { ok: false, error: 'WhatsApp needs an approved template outside the 24-hour window.', permanent: true }
      const payload = interaktTemplatePayload({ to, template: message.template, params: message.params, callbackData: message.id })
      const result = await postToInterakt(options.fetch, options.apiKey, payload)
      if (!result.ok) return { ok: false, error: result.error, permanent: result.permanent }
      return { ok: true, provider: options.name, providerId: result.id, cost: options.costOf(decodeWaParams(message.params).category) }
    },
  }
}

export type InteraktKeys = Readonly<{ messages: string; otp: string }>

/**
 * Which Interakt account sends: login and verification codes go from the OTP
 * number, everything else from the messages number, so a poor quality rating
 * on reminders can never block a login. Null when that account has no key.
 */
export function senderFor(kind: string | null | undefined, keys: InteraktKeys): { name: string; apiKey: string } | null {
  const otp = kind === 'otp'
  const apiKey = (otp ? keys.otp : keys.messages).trim()
  return apiKey ? { name: otp ? 'interakt-otp' : 'interakt', apiKey } : null
}
