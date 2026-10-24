import 'server-only'
import type { Types } from 'mongoose'
import { appUrl } from '@/lib/env'
import { enqueue } from '@/modules/messaging/send'
import { clientMailFrom } from '@/modules/domains/store'
import { FROM_HEADER } from '@/modules/messaging/channels/email'

export type MailAttachment = { filename: string; content: Buffer; mime?: string; /** StoredFile id when the file is also stored (Messages log download link). */ fileId?: Types.ObjectId | string }

/** Message `kind` values used across products (Settings -> Messages log filters by them). */
export type MailKind =
  | 'invite' | 'password_reset' | 'security' | 'subscription' | 'subscription_invoice' | 'invoice' | 'quote'
  | 'statement' | 'payslip' | 'letter' | 'claim_otp' | 'signup_otp' | 'onboarding' | 'reminder' | 'contact'
  | 'alert' | 'digest' | 'brief' | 'automation' | 'portal' | 'meeting' | 'other'

export type MailInput = {
  to: string | string[]
  cc?: string | string[]
  subject: string
  html: string
  text?: string
  attachments?: MailAttachment[]
  /** The workspace the mail belongs to (shows in Settings -> Messages log). */
  orgId?: Types.ObjectId
  kind?: MailKind
  /** The record the mail is about ('Invoice' + id), for "Send again" and links. */
  entity?: string
  entityId?: unknown
  /**
   * Live codes or tokens in the message (OTP, reset or invite token). They never
   * reach the server log, and once a provider delivers the mail the stored
   * copy has them masked, so DB or log access cannot reuse them. Such mail is
   * sent once, never retried.
   */
  secrets?: string[]
  /** False when the caller retries on its own (Folio reminders); otherwise a failed send is retried with backoff. */
  retry?: boolean
}

export type MailResult = { ok: boolean; id: string; provider: 'resend' | 'outbox'; error?: string }

/**
 * Sends an email through the message pipeline (modules/messaging): Resend when
 * RESEND_API_KEY is set, otherwise the message is only stored. Every message
 * lands in the Messages log either way. A failed send is retried at 1 m, 5 m,
 * 30 m and 2 h by the messages cron; `ok` reports the first attempt.
 */
export async function sendMail(input: MailInput): Promise<MailResult> {
  const kind = input.kind ?? 'other'
  // Client-facing mail goes from the workspace's own verified domain (add-on 'domains'), else Flowbit's default.
  const from = await clientMailFrom(input.orgId, kind)
  const result = await enqueue({
    channel: 'email',
    to: input.to,
    cc: input.cc ? (Array.isArray(input.cc) ? input.cc : [input.cc]) : undefined,
    subject: input.subject,
    html: input.html,
    text: input.text,
    attachments: input.attachments?.map((a) => ({ filename: a.filename, content: a.content, mime: a.mime, fileId: a.fileId })),
    orgId: input.orgId,
    kind,
    entity: input.entity,
    entityId: input.entityId,
    secrets: input.secrets,
    retry: input.retry,
    ...(from ? { headers: { [FROM_HEADER]: from } } : {}),
  })
  if (result.provider === 'outbox') console.info(`[mail] stored only (no RESEND_API_KEY): ${kind} message ${result.id}`)
  if (!result.ok) console.error('[mail] send failed', kind, result.id, result.error)
  const error = result.ok ? undefined : result.status === 'queued' ? `${result.error ?? 'Sending failed'}. Flowbit will retry automatically.` : result.error
  return { ok: result.ok, id: result.id, provider: result.provider === 'outbox' ? 'outbox' : 'resend', error }
}

export type EmailButton = Readonly<{ label: string; href: string; tone?: 'primary' | 'secondary' }>

/** A workspace's brand on client-facing mail (lib/email-brand builds it). */
export type EmailBrand = Readonly<{ name: string; logoUrl?: string | null; color?: string | null }>

const HEX = /^#[0-9a-f]{6}$/i

const absoluteUrl = (href: string) => (href.startsWith('http') ? href : appUrl(href))

/** White or near-black text, whichever reads better on the brand colour (WCAG relative luminance). */
function inkFor(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return (1.05 / (luminance + 0.05) >= 3 ? '#ffffff' : '#111014')
}

/** Flowbit's wordmark, or the workspace's logo and name on mail it sends to its own clients. */
function brandHeader(brand: EmailBrand | null): string {
  if (!brand) return '<div style="font-size:18px;font-weight:700;color:#EAC1DC;margin-bottom:24px">Flowbit</div>'
  const color = brand.color && HEX.test(brand.color) ? brand.color : '#EAC1DC'
  const logo = brand.logoUrl && /^https?:\/\//.test(brand.logoUrl) ? `<img src="${escapeHtml(brand.logoUrl)}" alt="" width="40" height="40" style="display:inline-block;vertical-align:middle;width:40px;height:40px;border-radius:10px;background:#fff;object-fit:contain;margin-right:12px">` : ''
  return `<div style="margin-bottom:24px">${logo}<span style="display:inline-block;vertical-align:middle;font-size:18px;font-weight:700;color:${color}">${escapeHtml(brand.name)}</span></div>`
}

export const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * Branded HTML email: dark card, gradient button. `paragraphs` are plain text
 * (escaped); `cta.href` may be a path ('/invite/abc') or a full URL.
 */
export function emailLayout(opts: {
  title: string
  paragraphs: string[]
  cta?: { label: string; href: string }
  footer?: string
  /** Extra HTML after the paragraphs (lists, tables), already escaped by the caller. */
  extraHtml?: string
  /** Plain-text lines for `extraHtml`. */
  extraText?: string[]
  /** Hidden inbox preview line. */
  preheader?: string
  /** Workspace name shown above the title. */
  workspace?: string
  /** Non-essential mail: an "Unsubscribe" link in the footer. */
  unsubscribeUrl?: string
  /** Link to the person's notification settings. */
  settingsHref?: string
  /** Several buttons in a row (Approve / Reject), after the paragraphs; `cta` still comes last. */
  buttons?: readonly EmailButton[]
  /** The workspace's own brand on client-facing mail: its name, logo (a public URL) and colour in place of Flowbit's. */
  brand?: EmailBrand | null
}): { html: string; text: string } {
  const href = opts.cta ? absoluteUrl(opts.cta.href) : ''
  const body = opts.paragraphs.map((p) => `<p style="margin:0 0 14px;color:#B7B0C2;font-size:14px;line-height:22px">${escapeHtml(p)}</p>`).join('')
  const brandColor = opts.brand?.color && HEX.test(opts.brand.color) ? opts.brand.color : null
  const fill = brandColor ?? 'linear-gradient(90deg,#EAC1DC,#BB62A5 45%,#4B2A8C)'
  const ink = brandColor ? inkFor(brandColor) : '#fff'
  const button = opts.cta
    ? `<a href="${escapeHtml(href)}" style="display:inline-block;margin-top:8px;padding:12px 22px;border-radius:999px;background:${fill};color:${ink};font-weight:600;font-size:14px;text-decoration:none">${escapeHtml(opts.cta.label)}</a>`
    : ''
  const buttons = opts.buttons?.length
    ? `<div style="margin:4px 0 12px">${opts.buttons.map((b) => `<a href="${escapeHtml(absoluteUrl(b.href))}" style="display:inline-block;margin:0 8px 8px 0;padding:11px 20px;border-radius:999px;${b.tone === 'secondary' ? 'background:transparent;border:1px solid rgba(255,255,255,0.25);color:#F4F1F8' : `background:${fill};color:${ink}`};font-weight:600;font-size:14px;text-decoration:none">${escapeHtml(b.label)}</a>`).join('')}</div>`
    : ''
  const settings = opts.settingsHref ? (opts.settingsHref.startsWith('http') ? opts.settingsHref : appUrl(opts.settingsHref)) : ''
  const links = [
    settings ? `<a href="${escapeHtml(settings)}" style="color:#B7B0C2">Alert settings</a>` : '',
    opts.unsubscribeUrl ? `<a href="${escapeHtml(opts.unsubscribeUrl)}" style="color:#B7B0C2">Unsubscribe</a>` : '',
  ].filter(Boolean)
  const preheader = opts.preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(opts.preheader)}</div>` : ''
  const workspace = opts.workspace && !opts.brand ? `<div style="margin:-16px 0 20px;color:#7E768C;font-size:12px">${escapeHtml(opts.workspace)}</div>` : ''
  const header = brandHeader(opts.brand ?? null)
  const html = `<!doctype html><html><body style="margin:0;background:#0B0A0F;font-family:'Work Sans',Arial,sans-serif;padding:32px 16px">${preheader}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;background:#121017;border:1px solid rgba(255,255,255,0.08);border-radius:20px;padding:32px">
<tr><td>
${header}
${workspace}<h1 style="margin:0 0 16px;color:#F4F1F8;font-size:22px;line-height:30px;font-weight:600">${escapeHtml(opts.title)}</h1>
${body}${opts.extraHtml ?? ''}${buttons}${button}
<p style="margin:28px 0 0;color:#7E768C;font-size:12px;line-height:18px">${escapeHtml(opts.footer ?? 'Sent by Flowbit. If you did not expect this email, you can ignore it.')}${links.length ? `<br>${links.join(' · ')}` : ''}</p>
</td></tr></table></td></tr></table></body></html>`
  const text = [
    opts.title,
    '',
    ...opts.paragraphs,
    ...(opts.extraText?.length ? ['', ...opts.extraText] : []),
    ...(opts.buttons?.length ? ['', ...opts.buttons.map((b) => `${b.label}: ${absoluteUrl(b.href)}`)] : []),
    ...(opts.cta ? ['', `${opts.cta.label}: ${href}`] : []),
    ...(settings ? ['', `Alert settings: ${settings}`] : []),
    ...(opts.unsubscribeUrl ? [`Unsubscribe: ${opts.unsubscribeUrl}`] : []),
  ].join('\n')
  return { html, text }
}
