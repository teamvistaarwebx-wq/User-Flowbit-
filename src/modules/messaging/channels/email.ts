import type { ChannelAdapter, SendOutcome } from '../types'

/**
 * Email channel through Resend. The client is injected (tests pass a fake;
 * the server builds the real SDK client), so no test ever sends real mail.
 * Without an API key nothing is sent: the message is kept in the Messages log
 * as "saved, not sent", as the old Outbox did.
 */

export type ResendLike = Readonly<{
  emails: {
    send: (payload: {
      from: string
      to: string[]
      cc?: string[]
      subject: string
      html: string
      text?: string
      attachments?: { filename: string; content: Buffer }[]
      headers?: Record<string, string>
      replyTo?: string | string[]
    }) => Promise<{ data: { id: string } | null; error: { message: string; name?: string } | null }>
  }
}>

/** Resend errors that will fail the same way however often they are retried. */
const PERMANENT_ERRORS = new Set(['validation_error', 'missing_required_field', 'invalid_parameter', 'invalid_from_address', 'invalid_attachment'])

/** A stored header naming the From line for one message (a workspace's own sending domain); never sent as a header. */
export const FROM_HEADER = 'X-Flowbit-From'

/** "Name <local@domain>" with a plain address: anything else falls back to the default sender. */
const SAFE_FROM = /^[^<>\r\n"]{0,80} <[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,63}>$/i

export type EmailAdapterOptions = Readonly<{ apiKey: string; from: string; client: (apiKey: string) => ResendLike }>

export function emailAdapter({ apiKey, from, client }: EmailAdapterOptions): ChannelAdapter {
  return {
    channel: 'email',
    async send(message): Promise<SendOutcome> {
      if (!message.to.length) return { ok: false, error: 'No email address.', permanent: true, skip: 'no_address' }
      if (!apiKey) return { ok: false, error: 'No email provider is set up (RESEND_API_KEY).', permanent: true, skip: 'no_provider' }
      if (!message.subject || !message.html) return { ok: false, error: 'The email has no subject or body.', permanent: true }
      // A stored 'Reply-To' header goes to Resend as its replyTo field (Orbit sequences reply to the salesperson).
      const { 'Reply-To': replyTo, [FROM_HEADER]: ownFrom, ...headers } = message.headers ?? {}
      const { data, error } = await client(apiKey).emails.send({
        from: ownFrom && SAFE_FROM.test(ownFrom) ? ownFrom : from,
        to: [...message.to],
        cc: message.cc?.length ? [...message.cc] : undefined,
        subject: message.subject,
        html: message.html,
        text: message.text,
        attachments: message.attachments?.map((a) => ({ filename: a.filename, content: a.content })),
        headers: Object.keys(headers).length ? headers : undefined,
        replyTo: replyTo ? (replyTo.includes(',') ? replyTo.split(',').map((r) => r.trim()).filter(Boolean) : replyTo) : undefined,
      })
      if (error) return { ok: false, error: error.message, permanent: PERMANENT_ERRORS.has(error.name ?? '') }
      return { ok: true, provider: 'resend', providerId: data?.id }
    },
  }
}
