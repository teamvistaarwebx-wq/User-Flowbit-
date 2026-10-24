import 'server-only'
import { randomBytes } from 'node:crypto'
import type { Types } from 'mongoose'
import { appUrl, encryptionKey } from '@/lib/env'
import { UserError } from '@/lib/errors'
import { lastFour, openSecret, sealSecret } from '@/lib/secret-box'
import { PaymentGateway } from '@/models/payments/PaymentGateway'
import type { RazorpayCredentials } from './razorpay-links'

/**
 * A workspace's own Razorpay account. Keys are sealed with AES-256-GCM before
 * they are stored and opened only here, on the server, to call Razorpay or
 * check a webhook. Pages get `GatewayInfo` (last four characters only).
 */

export type GatewayInfo = Readonly<{
  connected: boolean
  enabled: boolean
  mode: 'test' | 'live'
  keyId: string
  keySecret: string
  webhookSecret: string
  webhookUrl: string | null
  lastEventAt: Date | null
  encryptionReady: boolean
}>

export const webhookUrlFor = (hookKey: string) => appUrl(`/api/webhooks/razorpay/${hookKey}`)

export async function gatewayInfo(orgId: Types.ObjectId): Promise<GatewayInfo> {
  const row = await PaymentGateway.findOne({ orgId, provider: 'razorpay' }).lean()
  const encryptionReady = Boolean(encryptionKey())
  if (!row) return { connected: false, enabled: false, mode: 'test', keyId: '', keySecret: '', webhookSecret: '', webhookUrl: null, lastEventAt: null, encryptionReady }
  return {
    connected: true,
    enabled: row.enabled !== false,
    mode: row.mode === 'live' ? 'live' : 'test',
    keyId: row.keyIdLast4,
    keySecret: row.keySecretLast4,
    webhookSecret: row.webhookSecretLast4,
    webhookUrl: webhookUrlFor(row.hookKey),
    lastEventAt: row.lastEventAt ?? null,
    encryptionReady,
  }
}

function requireKey(): Buffer {
  const key = encryptionKey()
  if (!key) throw new UserError('This server cannot store payment keys yet: APP_ENCRYPTION_KEY is not set. Ask whoever runs Flowbit to add it.')
  return key
}

export type GatewayInput = Readonly<{ keyId: string; keySecret?: string; webhookSecret?: string; userId: Types.ObjectId }>

/** Saves (or replaces) the keys. Blank secrets keep the stored ones, so the form never needs to show them. */
export async function saveGateway(orgId: Types.ObjectId, input: GatewayInput): Promise<GatewayInfo> {
  const key = requireKey()
  const existing = await PaymentGateway.findOne({ orgId, provider: 'razorpay' }).select('+keySecretSealed +webhookSecretSealed').lean()
  if (!existing && (!input.keySecret || !input.webhookSecret)) throw new UserError('Enter the key secret and the webhook secret.', { keySecret: input.keySecret ? '' : 'Required', webhookSecret: input.webhookSecret ? '' : 'Required' })
  const set: Record<string, unknown> = {
    keyIdSealed: sealSecret(input.keyId, key),
    keyIdLast4: lastFour(input.keyId),
    mode: input.keyId.startsWith('rzp_live_') ? 'live' : 'test',
    enabled: true,
    updatedBy: input.userId,
  }
  if (input.keySecret) Object.assign(set, { keySecretSealed: sealSecret(input.keySecret, key), keySecretLast4: lastFour(input.keySecret) })
  if (input.webhookSecret) Object.assign(set, { webhookSecretSealed: sealSecret(input.webhookSecret, key), webhookSecretLast4: lastFour(input.webhookSecret) })
  await PaymentGateway.updateOne({ orgId, provider: 'razorpay' }, { $set: set, $setOnInsert: { hookKey: randomBytes(18).toString('base64url') } }, { upsert: true })
  return gatewayInfo(orgId)
}

export async function removeGateway(orgId: Types.ObjectId): Promise<boolean> {
  const res = await PaymentGateway.deleteOne({ orgId, provider: 'razorpay' })
  return res.deletedCount > 0
}

/** The opened API keys, or null when not connected, switched off, or the keys cannot be opened (APP_ENCRYPTION_KEY changed). */
export async function gatewayCredentials(orgId: Types.ObjectId): Promise<RazorpayCredentials | null> {
  const key = encryptionKey()
  if (!key) return null
  const row = await PaymentGateway.findOne({ orgId, provider: 'razorpay', enabled: true }).select('+keyIdSealed +keySecretSealed').lean()
  if (!row) return null
  const keyId = openSecret(row.keyIdSealed, key)
  const keySecret = openSecret(row.keySecretSealed, key)
  return keyId && keySecret ? { keyId, keySecret } : null
}

/** The workspace and webhook secret behind a webhook URL's key, or null. */
export async function gatewayForHook(hookKey: string): Promise<{ orgId: Types.ObjectId; webhookSecret: string } | null> {
  const key = encryptionKey()
  if (!key || !/^[A-Za-z0-9_-]{24}$/.test(hookKey)) return null
  const row = await PaymentGateway.findOne({ hookKey, provider: 'razorpay' }).select('+webhookSecretSealed').lean()
  const webhookSecret = row ? openSecret(row.webhookSecretSealed, key) : null
  return row && webhookSecret ? { orgId: row.orgId, webhookSecret } : null
}
