import type { Channel } from './events'

/** Message lifecycle (notifications-v2 §1.1). */
export const MESSAGE_STATUSES = ['scheduled', 'queued', 'sending', 'sent', 'delivered', 'read', 'failed', 'skipped'] as const
export type MessageStatus = (typeof MESSAGE_STATUSES)[number]

/** Why a message was not sent; shown in the Messages log. */
export const SKIP_REASONS = {
  opted_out: 'The recipient unsubscribed or replied STOP',
  snoozed: 'The recipient snoozed alerts',
  no_address: 'No email address or number',
  no_provider: 'No email provider is set up, so it was saved here only',
  whatsapp_not_connected: 'WhatsApp is not connected yet',
  whatsapp_off: 'WhatsApp is turned off for now',
  digest: 'Batched into a digest email',
  wallet_empty: 'The WhatsApp wallet is empty',
  wallet_cap: 'The WhatsApp spend cap is reached',
} as const
export type SkipReason = keyof typeof SKIP_REASONS

/** An attachment as an adapter sends it. */
export type OutgoingAttachment = Readonly<{ filename: string; content: Buffer; mime?: string }>

/** What a channel adapter needs to deliver one message. */
export type OutgoingMessage = Readonly<{
  id: string
  channel: Channel
  orgId?: string
  userId?: string
  to: readonly string[]
  cc?: readonly string[]
  subject?: string
  html?: string
  text?: string
  /** In-app: the bell row. */
  title?: string
  body?: string
  href?: string
  event?: string
  /** Mail kind ('otp', 'subscription'…): picks the WhatsApp sender (OTP number vs messages number). */
  kind?: string
  /** WhatsApp: the approved template and its variables. */
  template?: string
  params?: Readonly<Record<string, string>>
  attachments?: readonly OutgoingAttachment[]
  headers?: Readonly<Record<string, string>>
  /** WhatsApp: 'platform' is Flowbit's own number (WhatsApp A); 'workspace' the workspace's own number (WhatsApp B, wallet-charged). */
  sender?: 'platform' | 'workspace'
  /** Attempts before this one (the wallet charges each attempt under its own key). */
  attempts?: number
}>

export type SendOutcome =
  /** `cost`: paise the provider charges for it (WhatsApp rate card), recorded on the message. */
  | Readonly<{ ok: true; provider: string; providerId?: string; cost?: number }>
  /** `skip`: not an error to retry but a reason this channel cannot deliver (no provider, not connected). */
  | Readonly<{ ok: false; error: string; permanent?: boolean; skip?: SkipReason; hold?: boolean }>

/** One channel (email, in-app, WhatsApp) behind one interface. */
export interface ChannelAdapter {
  readonly channel: Channel
  send(message: OutgoingMessage): Promise<SendOutcome>
}

export type TimelineEntry = Readonly<{ at: Date; status: MessageStatus; note?: string }>

/** The part of a stored message the delivery step reads. */
export type DeliverableMessage = OutgoingMessage &
  Readonly<{
    attempts: number
    /** False for single-shot mails (live codes) and callers with their own retry. */
    retry: boolean
    /** Another channel to use when this one cannot deliver (e.g. WhatsApp → email). */
    fallback?: Readonly<{ channel: Channel; to: readonly string[] }> | null
    /** When it was stored: a held WhatsApp message (empty wallet, spend cap) fails 24 hours after this. */
    createdAt?: Date
  }>

export type DeliveryResult = Readonly<{
  status: MessageStatus
  provider?: string
  providerId?: string
  error?: string
  skipReason?: SkipReason
  nextAttemptAt?: Date | null
  /** Id of the message created on the fallback channel. */
  fallbackId?: string
}>
