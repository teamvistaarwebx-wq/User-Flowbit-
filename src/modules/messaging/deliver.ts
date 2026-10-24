import type { Channel } from './events'
import { nextRetryAt } from './timing'
import type { ChannelAdapter, DeliverableMessage, DeliveryResult, MessageStatus, SendOutcome, SkipReason, TimelineEntry } from './types'

/**
 * One delivery attempt (pure apart from the injected store and adapters, so
 * it is tested without a database or a provider):
 *   sent    → done;
 *   skip    → skipped with its reason (no provider, WhatsApp not connected…);
 *   error   → back in the queue with backoff (1 m, 5 m, 30 m, 2 h), then failed;
 * and when the channel cannot deliver and the message allows it, a copy goes
 * out on the fallback channel (WhatsApp → email).
 *   hold    → (WhatsApp B: empty wallet or spend cap) the fallback when there
 *             is one; otherwise held, tried again every 30 minutes, and failed
 *             with the reason 24 hours after it was stored.
 */

/** How long a held WhatsApp message waits for a recharge (notifications-v2 §2.3). */
export const HOLD_MS = 24 * 3_600_000
export const HOLD_RETRY_MS = 30 * 60_000

/** When a held message is tried again, or null once its 24 hours are over. */
export function holdRetryAt(createdAt: Date | undefined, now: Date): Date | null {
  const deadline = (createdAt ?? now).getTime() + HOLD_MS
  if (now.getTime() >= deadline) return null
  return new Date(Math.min(now.getTime() + HOLD_RETRY_MS, deadline))
}

export type DeliveryPatch = Readonly<{
  status: MessageStatus
  attempts: number
  provider?: string
  providerId?: string
  error?: string | null
  skipReason?: SkipReason
  nextAttemptAt?: Date | null
  sentAt?: Date
  fallbackId?: string
  /** Paise the provider charged (WhatsApp). */
  cost?: number
}>

export type DeliveryStore = Readonly<{
  /** Saves the outcome and appends `entry` to the message timeline. */
  save: (id: string, patch: DeliveryPatch, entry: TimelineEntry) => Promise<void>
  /** Creates and sends the same message on another channel; returns the new id. */
  fallback: (message: DeliverableMessage, channel: Channel, to: readonly string[]) => Promise<string>
}>

export type DeliveryDeps = Readonly<{
  adapters: Readonly<Partial<Record<Channel, ChannelAdapter>>>
  store: DeliveryStore
  now?: () => Date
  log?: (message: string, error?: unknown) => void
}>

const errorText = (error: unknown) => (error instanceof Error ? error.message : 'Unknown delivery error')

async function attempt(adapter: ChannelAdapter | undefined, message: DeliverableMessage, log: NonNullable<DeliveryDeps['log']>): Promise<SendOutcome> {
  if (!adapter) return { ok: false, error: `No ${message.channel} channel is available.`, permanent: true }
  try {
    return await adapter.send(message)
  } catch (error) {
    log(`[messages] ${message.channel} adapter threw for ${message.id}`, error)
    return { ok: false, error: errorText(error) }
  }
}

const hasFallback = (message: DeliverableMessage): boolean => Boolean(message.fallback && message.fallback.channel !== message.channel && message.fallback.to.length)

async function tryFallback(message: DeliverableMessage, store: DeliveryStore): Promise<string | undefined> {
  const target = message.fallback
  if (!target || target.channel === message.channel || !target.to.length) return undefined
  return store.fallback(message, target.channel, target.to)
}

/** Runs one attempt for `message` and records the result. Never throws for a provider error. */
export async function deliver(message: DeliverableMessage, deps: DeliveryDeps): Promise<DeliveryResult> {
  const now = (deps.now ?? (() => new Date()))()
  const log = deps.log ?? console.error
  const attempts = message.attempts + 1
  const outcome = await attempt(deps.adapters[message.channel], message, log)

  if (outcome.ok) {
    await deps.store.save(message.id, { status: 'sent', attempts, provider: outcome.provider, providerId: outcome.providerId, error: null, nextAttemptAt: null, sentAt: now, ...(outcome.cost !== undefined ? { cost: outcome.cost } : {}) }, { at: now, status: 'sent', note: `Accepted by ${outcome.provider}` })
    return { status: 'sent', provider: outcome.provider, providerId: outcome.providerId }
  }

  if (outcome.hold && !hasFallback(message)) {
    const retryAt = holdRetryAt(message.createdAt, now)
    if (retryAt) {
      await deps.store.save(message.id, { status: 'queued', attempts, error: outcome.error, nextAttemptAt: retryAt }, { at: now, status: 'queued', note: `Held: ${outcome.error} Trying again until 24 hours after it was created.` })
      return { status: 'queued', error: outcome.error, nextAttemptAt: retryAt }
    }
    const error = `Held for 24 hours and not sent: ${outcome.error}`
    await deps.store.save(message.id, { status: 'failed', attempts, error, nextAttemptAt: null }, { at: now, status: 'failed', note: error })
    return { status: 'failed', error }
  }

  if (outcome.skip) {
    const fallbackId = await tryFallback(message, deps.store)
    const note = fallbackId ? `${outcome.error} Sent by ${message.fallback?.channel} instead.` : outcome.error
    await deps.store.save(message.id, { status: 'skipped', attempts, skipReason: outcome.skip, error: outcome.error, nextAttemptAt: null, fallbackId }, { at: now, status: 'skipped', note })
    return { status: 'skipped', skipReason: outcome.skip, error: outcome.error, fallbackId }
  }

  const retryAt = message.retry && !outcome.permanent ? nextRetryAt(attempts, now) : null
  if (retryAt) {
    await deps.store.save(message.id, { status: 'queued', attempts, error: outcome.error, nextAttemptAt: retryAt }, { at: now, status: 'queued', note: `Attempt ${attempts} failed: ${outcome.error}. Retrying.` })
    return { status: 'queued', error: outcome.error, nextAttemptAt: retryAt }
  }

  const fallbackId = await tryFallback(message, deps.store)
  const note = `Attempt ${attempts} failed: ${outcome.error}${fallbackId ? ` Sent by ${message.fallback?.channel} instead.` : ''}`
  await deps.store.save(message.id, { status: 'failed', attempts, error: outcome.error, nextAttemptAt: null, fallbackId }, { at: now, status: 'failed', note })
  return { status: 'failed', error: outcome.error, fallbackId }
}
