import { createHmac, timingSafeEqual } from 'node:crypto'
import type { MessageStatus } from '@/modules/messaging/types'
import { toE164 } from './phone'

/**
 * Interakt webhooks (pure): authenticity, then the parts Flowbit uses.
 *
 * Authenticity: Interakt's public docs (checked 8 Oct 2026, pages not
 * reachable) describe no signature we could confirm, so the endpoint takes a
 * shared secret (INTERAKT_WEBHOOK_SECRET) as `?token=` in the URL configured
 * in Interakt, and also accepts an HMAC-SHA256 hex of the raw body in an
 * `interakt-signature` / `x-interakt-signature` header should Interakt sign.
 *
 * Events: message_api_sent / _delivered / _read / _failed carry our Message
 * id as callback data (and Interakt's message id); message_received is an
 * inbound message from a customer.
 */

const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

export function verifyInteraktWebhook(input: { raw: string; token?: string | null; signature?: string | null }, secret: string): boolean {
  if (!secret) return false
  if (input.token && safeEqual(input.token, secret)) return true
  const sig = (input.signature ?? '').replace(/^sha256=/i, '').trim().toLowerCase()
  if (!/^[0-9a-f]{64}$/.test(sig)) return false
  return safeEqual(createHmac('sha256', secret).update(input.raw).digest('hex'), sig)
}

export type InteraktStatusEvent = Readonly<{ kind: 'status'; status: MessageStatus; providerId: string | null; callbackData: string | null; error: string | null; at: Date }>
export type GeoPoint = Readonly<{ lat: number; lng: number }>
/** A click-to-WhatsApp ad that started the chat (Meta's `referral`). */
export type AdReferral = Readonly<{ sourceType: string; sourceId: string | null; headline: string | null; sourceUrl: string | null }>

export type InteraktInboundEvent = Readonly<{
  kind: 'inbound'
  phone: string
  name: string | null
  text: string
  providerId: string | null
  at: Date
  /** A quick-reply button press: the payload the template carried (Interakt `button_payload`). */
  payload?: string | null
  /** A shared location (the employee bot's check-in). */
  location?: GeoPoint | null
  referral?: AdReferral | null
}>
export type InteraktEvent = InteraktStatusEvent | InteraktInboundEvent

const STATUS_BY_TYPE: Readonly<Record<string, MessageStatus>> = {
  message_api_sent: 'sent',
  message_api_delivered: 'delivered',
  message_api_read: 'read',
  message_api_clicked: 'read',
  message_api_failed: 'failed',
}

/** Interakt's status word inside the message, when the type alone does not say. */
const STATUS_BY_WORD: Readonly<Record<string, MessageStatus>> = { sent: 'sent', delivered: 'delivered', read: 'read', seen: 'read', failed: 'failed' }

type Obj = Record<string, unknown>
const obj = (v: unknown): Obj => (v && typeof v === 'object' ? (v as Obj) : {})
const str = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '')

function timeOf(message: Obj): Date {
  const raw = message.received_at_utc ?? message.delivered_at_utc ?? message.seen_at_utc ?? message.created_at_utc ?? message.timestamp
  const at = typeof raw === 'number' ? new Date(raw > 1e12 ? raw : raw * 1000) : new Date(str(raw))
  return Number.isNaN(at.getTime()) ? new Date() : at
}

/**
 * The quick-reply payload of a button press. Interakt's public docs do not
 * pin the field down (beta: verify with a real account), so the known
 * spellings are all read: Interakt's own, Meta's `button.payload` and an
 * interactive `button_reply.id`.
 */
function buttonPayloadOf(message: Obj): string | null {
  const inner = obj(message.message)
  const candidates = [message.button_payload, message.buttonPayload, inner.button_payload, inner.payload, obj(message.button).payload, obj(inner.button).payload, obj(obj(inner.interactive).button_reply).id, obj(message.button_reply).id]
  const found = candidates.map(str).find((v) => v.trim())
  return found ? found.trim().slice(0, 300) : null
}

const coordinate = (v: unknown, limit: number): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN
  return Number.isFinite(n) && Math.abs(n) <= limit ? n : null
}

/** A shared location (`message_content_type: Location`), in whichever shape it arrives. */
function locationOf(message: Obj): GeoPoint | null {
  for (const source of [message, obj(message.message), obj(message.location), obj(obj(message.message).location)]) {
    const lat = coordinate(source.latitude ?? source.lat, 90)
    const lng = coordinate(source.longitude ?? source.lng ?? source.long, 180)
    if (lat !== null && lng !== null) return { lat, lng }
  }
  return null
}

/** Meta marks a chat opened from a click-to-WhatsApp ad with `referral` (source_type 'ad'). */
function referralOf(message: Obj, data: Obj): AdReferral | null {
  const ref = [message.referral, obj(message.meta_data).referral, data.referral, obj(message.message).referral].map(obj).find((r) => str(r.source_type) || str(r.source_id) || str(r.ctwa_clid))
  if (!ref) return null
  return { sourceType: str(ref.source_type) || 'ad', sourceId: str(ref.source_id) || null, headline: str(ref.headline) || null, sourceUrl: str(ref.source_url) || null }
}

/** Maps one webhook body to a status or an inbound message; null for anything Flowbit ignores. */
export function parseInteraktEvent(body: unknown): InteraktEvent | null {
  const root = obj(body)
  const type = str(root.type)
  const data = obj(root.data)
  const message = obj(data.message)
  const customer = obj(data.customer)
  if (type === 'message_received') {
    const phone = toE164(`${str(customer.country_code)}${str(customer.phone_number)}`) ?? toE164(str(customer.phone_number))
    const payload = buttonPayloadOf(message)
    const location = locationOf(message)
    const referral = referralOf(message, data)
    const text = str(message.message) || str(obj(message.message).body) || str(obj(message.message).text) || str(obj(message.button).text)
    if (!phone || (!text.trim() && !payload && !location)) return null
    return {
      kind: 'inbound',
      phone,
      name: str(obj(customer.traits).name) || null,
      text: text.trim().slice(0, 4096),
      providerId: str(message.id) || null,
      at: timeOf(message),
      ...(payload ? { payload } : {}),
      ...(location ? { location } : {}),
      ...(referral ? { referral } : {}),
    }
  }
  const status = STATUS_BY_TYPE[type] ?? STATUS_BY_WORD[str(message.message_status).toLowerCase()]
  if (!status) return null
  const callbackData = str(message.callback_data) || str(obj(obj(message.meta_data).source_data).callback_data) || str(root.callback_data) || null
  const providerId = str(message.id) || null
  if (!callbackData && !providerId) return null
  return { kind: 'status', status, providerId, callbackData, error: status === 'failed' ? str(message.channel_failure_reason) || str(message.failure_reason) || 'WhatsApp could not deliver it' : null, at: timeOf(message) }
}

/** Free text is allowed only inside 24 hours of the person's last message; after that a template is needed. */
export const SESSION_WINDOW_MS = 24 * 3_600_000

export const canSendFreeText = (lastInboundAt: Date | null | undefined, now: Date): boolean =>
  Boolean(lastInboundAt) && now.getTime() - lastInboundAt!.getTime() < SESSION_WINDOW_MS

/** Minutes left in the window (0 when closed), for the reply box. */
export const windowMinutesLeft = (lastInboundAt: Date | null | undefined, now: Date): number =>
  lastInboundAt ? Math.max(0, Math.floor((lastInboundAt.getTime() + SESSION_WINDOW_MS - now.getTime()) / 60_000)) : 0
