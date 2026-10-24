import PostalMime, { type Address } from 'postal-mime'
import { withTimeout } from '@/lib/fetch-timeout'
import { verifyResendWebhook } from '@/modules/messaging/signatures'
import { verifySignature } from '@/modules/webhooks/sign'

/**
 * Inbound email, provider-agnostic: Resend inbound ("email.received", Svix
 * signed; body and attachments fetched from Resend's receiving API) or a
 * generic JSON post signed with X-Flowbit-Signature (any provider or a small
 * forwarding script), either already split into fields or carrying the whole
 * message as MIME (`raw`, base64, or `mime`, text), parsed with postal-mime.
 * Both become one InboundEmail. Pure apart from `fetchImpl`.
 */

export type InboundAttachment = Readonly<{ filename: string; contentType: string; size: number; content: Buffer | null; url: string | null }>
/** SPF, DKIM and DMARC verdicts as the provider reported them (lower case, e.g. "pass", "fail", "softfail"); absent when not reported. */
export type MailAuth = Readonly<{ spf?: string; dkim?: string; dmarc?: string }>
export type InboundEmail = Readonly<{ from: string; to: string[]; subject: string; text: string; attachments: InboundAttachment[]; messageId: string | null; auth?: MailAuth | null }>

export type Fetch = (input: string, init?: RequestInit) => Promise<Response>
export type InboundHeaders = Readonly<{ get: (name: string) => string | null }>

export type Verified = Readonly<{ provider: 'resend' | 'generic'; body: unknown }>

/** Which provider signed this request (or null when nobody valid did). */
export function verifyInbound(raw: string, headers: InboundHeaders, secret: string): Verified | null {
  if (!secret) return null
  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return null
  }
  if (headers.get('svix-id')) {
    const ok = verifyResendWebhook(raw, { id: headers.get('svix-id'), timestamp: headers.get('svix-timestamp'), signature: headers.get('svix-signature') }, secret)
    return ok ? { provider: 'resend', body } : null
  }
  return verifySignature(secret, raw, headers.get('x-flowbit-signature')) ? { provider: 'generic', body } : null
}

const str = (v: unknown) => (typeof v === 'string' ? v : '')

const AUTH_KEYS = ['spf', 'dkim', 'dmarc'] as const

/** "mx.example; spf=pass smtp.mailfrom=…; dkim=pass header.d=…; dmarc=fail" → { spf: 'pass', dkim: 'pass', dmarc: 'fail' }. The first verdict of each kind wins. */
export function parseAuthResults(header: string): MailAuth | null {
  const out: Record<string, string> = {}
  for (const key of AUTH_KEYS) {
    const m = new RegExp(`(?:^|[;\\s])${key}=([a-z]+)`, 'i').exec(header)
    if (m) out[key] = m[1].toLowerCase()
  }
  return Object.keys(out).length ? out : null
}

/** Verdicts from a provider body: an `auth` object, top-level `spf`/`dkim`/`dmarc` fields, or an Authentication-Results header. */
export function authFromBody(b: Record<string, unknown>): MailAuth | null {
  const nested = (b.auth && typeof b.auth === 'object' ? b.auth : b) as Record<string, unknown>
  const out: Record<string, string> = {}
  for (const key of AUTH_KEYS) {
    const v = nested[key]
    const verdict = typeof v === 'string' ? v : v && typeof v === 'object' ? str((v as Record<string, unknown>).result ?? (v as Record<string, unknown>).status) : ''
    if (verdict.trim()) out[key] = verdict.trim().toLowerCase()
  }
  if (Object.keys(out).length) return out
  const headers = (b.headers && typeof b.headers === 'object' ? b.headers : {}) as Record<string, unknown>
  const results = Object.entries(headers).find(([k]) => k.toLowerCase() === 'authentication-results')?.[1]
  return typeof results === 'string' ? parseAuthResults(results) : null
}

/** The reason to refuse a mail whose provider-reported SPF, DKIM or DMARC did not pass, or null. Unreported checks are not held against it. */
export function authFailure(auth: MailAuth | null | undefined): string | null {
  if (!auth) return null
  const failed = AUTH_KEYS.filter((k) => auth[k] !== undefined && auth[k] !== 'pass')
  return failed.length ? `sender authentication failed (${failed.map((k) => `${k.toUpperCase()} ${auth[k]}`).join(', ')})` : null
}
const list = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : typeof v === 'string' ? v.split(',').map((s) => s.trim()).filter(Boolean) : [])

/** HTML to readable text, for mails without a text part. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** The generic JSON shape: { from, to, subject, text?, html?, message_id?, attachments?: [{ filename, content_type, content (base64) }] }. */
export function fromGeneric(body: unknown): InboundEmail | null {
  const b = (body ?? {}) as Record<string, unknown>
  const from = str(b.from)
  const to = list(b.to)
  if (!from || !to.length) return null
  const atts = Array.isArray(b.attachments) ? (b.attachments as Record<string, unknown>[]) : []
  return {
    from,
    to,
    subject: str(b.subject),
    text: str(b.text) || htmlToText(str(b.html)),
    messageId: str(b.message_id) || null,
    auth: authFromBody(b),
    attachments: atts.map((a) => {
      const content = typeof a.content === 'string' ? Buffer.from(a.content, 'base64') : null
      return { filename: str(a.filename) || 'attachment', contentType: str(a.content_type ?? a.contentType) || 'application/octet-stream', size: content?.length ?? Number(a.size ?? 0), content, url: null }
    }),
  }
}

/**
 * Resend's receiving API failed for a passing reason (timeout, 429, 5xx):
 * the route answers 5xx so Resend redelivers the event.
 */
export class InboundUpstreamError extends Error {
  constructor(readonly status: number | null, cause?: unknown) {
    super(status ? `Resend receiving API answered ${status}` : 'Resend receiving API did not answer', { cause })
    this.name = 'InboundUpstreamError'
  }
}

const HTTP_NOT_FOUND = 404

/**
 * Resend "email.received": the event carries the id; the body and attachment
 * links come from the receiving API. Null for other events or a mail Resend
 * no longer has; throws InboundUpstreamError when the API is unreachable or failing.
 */
export async function fromResend(body: unknown, apiKey: string, fetchImpl: Fetch = fetch): Promise<InboundEmail | null> {
  const event = (body ?? {}) as { type?: string; data?: Record<string, unknown> }
  if (event.type !== 'email.received' || !event.data) return null
  const id = str(event.data.email_id ?? event.data.id)
  if (!id || !apiKey) return null
  const auth = { headers: { Authorization: `Bearer ${apiKey}` } }
  const timed = withTimeout(fetchImpl)
  const res = await timed(`https://api.resend.com/emails/receiving/${encodeURIComponent(id)}`, auth).catch((error: unknown) => {
    throw new InboundUpstreamError(null, error)
  })
  if (res.status === HTTP_NOT_FOUND) return null
  if (!res.ok) throw new InboundUpstreamError(res.status)
  const mail = (await res.json()) as Record<string, unknown>
  const attRes = await timed(`https://api.resend.com/emails/receiving/${encodeURIComponent(id)}/attachments`, auth).catch(() => null)
  const attList = attRes?.ok ? (((await attRes.json()) as { data?: Record<string, unknown>[] }).data ?? []) : []
  return {
    from: str(mail.from ?? event.data.from),
    to: list(mail.to ?? event.data.to),
    subject: str(mail.subject ?? event.data.subject),
    text: str(mail.text) || htmlToText(str(mail.html)),
    messageId: str(mail.message_id) || id,
    auth: authFromBody(mail) ?? authFromBody(event.data),
    attachments: attList.map((a) => ({ filename: str(a.filename) || 'attachment', contentType: str(a.content_type) || 'application/octet-stream', size: Number(a.size ?? 0), content: null, url: str(a.download_url) || null })),
  }
}

/** Raw messages above this are refused before parsing (the route already caps the request at 4 MB). */
export const MAX_MIME_BYTES = 4 * 1024 * 1024

const mailboxes = (list: readonly Address[] | undefined): string[] =>
  (list ?? []).flatMap((a) => (a.address ? [a.name ? `${a.name} <${a.address}>` : a.address] : (a.group ?? []).map((g) => g.address)))

const toBuffer = (content: ArrayBuffer | Uint8Array | string): Buffer =>
  typeof content === 'string' ? Buffer.from(content, 'utf8') : Buffer.from(content instanceof ArrayBuffer ? new Uint8Array(content) : content)

/**
 * A whole RFC 822 message → InboundEmail. `envelopeTo` (the SMTP recipients a
 * provider reports) wins over the To/Cc headers, since a forwarded or Bcc'd
 * mail may not name the tasks+ address in its headers. Null when unreadable.
 */
export async function fromMime(raw: Buffer | string, envelopeTo: readonly string[] = []): Promise<InboundEmail | null> {
  const size = typeof raw === 'string' ? Buffer.byteLength(raw) : raw.length
  if (!size || size > MAX_MIME_BYTES) return null
  let mail: Awaited<ReturnType<typeof PostalMime.parse>>
  try {
    mail = await PostalMime.parse(raw, { attachmentEncoding: 'arraybuffer', maxNestingDepth: 20 })
  } catch {
    return null
  }
  const from = mailboxes(mail.from ? [mail.from] : [])[0] ?? ''
  const to = envelopeTo.length ? [...envelopeTo] : [...mailboxes(mail.to), ...mailboxes(mail.cc), ...(mail.deliveredTo ? [mail.deliveredTo] : [])]
  if (!from || !to.length) return null
  const authHeader = mail.headers.filter((h) => h.key === 'authentication-results').map((h) => h.value).join('; ')
  return {
    from,
    to,
    subject: mail.subject ?? '',
    text: mail.text?.trim() || htmlToText(mail.html ?? ''),
    messageId: mail.messageId ?? null,
    auth: authHeader ? parseAuthResults(authHeader) : null,
    attachments: mail.attachments
      .filter((a) => a.disposition !== 'inline' || a.filename)
      .map((a) => {
        const content = toBuffer(a.content)
        return { filename: a.filename || 'attachment', contentType: a.mimeType || 'application/octet-stream', size: content.length, content, url: null }
      }),
  }
}

/**
 * The generic body: a raw MIME message (`raw` in base64, or `mime` as text,
 * with optional `to` as the envelope recipients and an `auth` object that
 * overrides the message's own Authentication-Results), else the split JSON
 * shape of fromGeneric.
 */
export async function fromGenericBody(body: unknown): Promise<InboundEmail | null> {
  const b = (body ?? {}) as Record<string, unknown>
  const mime = typeof b.raw === 'string' ? Buffer.from(b.raw, 'base64') : typeof b.mime === 'string' ? b.mime : null
  if (mime === null) return fromGeneric(body)
  const parsed = await fromMime(mime, list(b.to))
  if (!parsed) return null
  const providerAuth = authFromBody({ ...(b.auth ? { auth: b.auth } : {}), spf: b.spf, dkim: b.dkim, dmarc: b.dmarc })
  return providerAuth ? { ...parsed, auth: providerAuth } : parsed
}
