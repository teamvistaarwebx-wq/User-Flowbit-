import 'server-only'
import { randomBytes } from 'node:crypto'
import type { Types } from 'mongoose'
import { dbConnect } from '@/lib/db'
import { appUrl, encryptionKey } from '@/lib/env'
import { UserError } from '@/lib/errors'
import { lastFour, openSecret, sealSecret } from '@/lib/secret-box'
import { WaConnection } from '@/models/whatsapp/WaConnection'
import { whatsAppEnabled } from '@/modules/features/flags'
import { mergeCustomerTemplates, type CustomerTemplateRegistry } from './customer-templates'
import type { WorkspaceMode } from './provider'

/**
 * A workspace's WhatsApp B connection. The Interakt API key and webhook
 * secret are sealed (AES-256-GCM) before they are stored and opened only
 * here, on the server, to send or to check a webhook. Pages get
 * `ConnectionInfo`: the last four characters only.
 */

export type ConnectionInfo = Readonly<{
  connected: boolean
  mode: WorkspaceMode
  apiKey: string
  webhookSecret: string
  displayName: string
  phone: string
  webhookUrl: string | null
  lastEventAt: Date | null
  lastTest: { at: Date; ok: boolean; to: string; error?: string } | null
  templates: CustomerTemplateRegistry
  encryptionReady: boolean
  botEnabled: boolean
  cannedReplies: readonly { id: string; title: string; text: string }[]
}>

const HOOK_KEY = /^[A-Za-z0-9_-]{24}$/
export const newHookKey = (): string => randomBytes(18).toString('base64url')
export const whatsappWebhookUrl = (hookKey: string): string => appUrl(`/api/webhooks/whatsapp/${hookKey}`)

export async function connectionInfo(orgId: Types.ObjectId): Promise<ConnectionInfo> {
  await dbConnect()
  const row = await WaConnection.findOne({ orgId }).lean()
  const connected = row?.status === 'connected'
  return {
    connected,
    mode: row?.mode === 'managed' ? 'managed' : 'byo',
    apiKey: connected ? (row?.apiKeyLast4 ?? '') : '',
    webhookSecret: connected ? (row?.webhookSecretLast4 ?? '') : '',
    displayName: row?.displayName ?? '',
    phone: row?.phone ?? '',
    webhookUrl: connected && row ? whatsappWebhookUrl(row.hookKey) : null,
    lastEventAt: row?.lastEventAt ?? null,
    lastTest: row?.lastTest?.at ? { at: row.lastTest.at, ok: Boolean(row.lastTest.ok), to: row.lastTest.to ?? '', error: row.lastTest.error ?? undefined } : null,
    templates: mergeCustomerTemplates(row?.templates),
    encryptionReady: Boolean(encryptionKey()),
    botEnabled: Boolean(row?.botEnabled),
    cannedReplies: (row?.cannedReplies ?? []).map((r) => ({ id: String(r._id), title: r.title, text: r.text })),
  }
}

/** True when the workspace's own number can send (the nav, the grids and the send buttons read this). */
/** False while the WhatsApp feature flag is off, so every caller treats WhatsApp as unavailable. */
export async function isWhatsAppConnected(orgId: Types.ObjectId): Promise<boolean> {
  if (!(await whatsAppEnabled())) return false
  await dbConnect()
  return Boolean(await WaConnection.exists({ orgId, status: 'connected' }))
}

function requireKey(): Buffer {
  const key = encryptionKey()
  if (!key) throw new UserError('This server cannot store WhatsApp keys yet: APP_ENCRYPTION_KEY is not set. Ask whoever runs Flowbit to add it.')
  return key
}

export type ByoInput = Readonly<{ apiKey?: string; webhookSecret?: string; displayName: string; phone: string; userId: Types.ObjectId }>

/** Saves (or updates) "bring your own Interakt account". Blank secrets keep the stored ones. */
export async function saveByoConnection(orgId: Types.ObjectId, input: ByoInput): Promise<ConnectionInfo> {
  const key = requireKey()
  const existing = await WaConnection.findOne({ orgId }).select('+apiKeySealed +webhookSecretSealed').lean()
  const hasKey = Boolean(existing?.status === 'connected' && existing.apiKeySealed)
  const hasSecret = Boolean(existing?.status === 'connected' && existing.webhookSecretSealed)
  if ((!hasKey && !input.apiKey) || (!hasSecret && !input.webhookSecret)) {
    throw new UserError('Enter the Interakt API key and a webhook secret.', { apiKey: input.apiKey || hasKey ? '' : 'Required', webhookSecret: input.webhookSecret || hasSecret ? '' : 'Required' })
  }
  const set: Record<string, unknown> = { mode: 'byo', status: 'connected', displayName: input.displayName, phone: input.phone }
  if (input.apiKey) Object.assign(set, { apiKeySealed: sealSecret(input.apiKey, key), apiKeyLast4: lastFour(input.apiKey) })
  if (input.webhookSecret) Object.assign(set, { webhookSecretSealed: sealSecret(input.webhookSecret, key), webhookSecretLast4: lastFour(input.webhookSecret) })
  if (existing?.status !== 'connected') Object.assign(set, { connectedAt: new Date(), connectedBy: input.userId })
  await WaConnection.updateOne({ orgId }, { $set: set, $unset: { disconnectedAt: 1 }, $setOnInsert: { hookKey: newHookKey() } }, { upsert: true })
  return connectionInfo(orgId)
}

/** Wipes both secrets and retires the webhook URL; the template mapping stays for a reconnect. */
export async function disconnectWhatsApp(orgId: Types.ObjectId): Promise<boolean> {
  const res = await WaConnection.updateOne(
    { orgId, status: 'connected' },
    { $set: { status: 'disconnected', disconnectedAt: new Date(), apiKeyLast4: '', webhookSecretLast4: '', hookKey: newHookKey() }, $unset: { apiKeySealed: 1, webhookSecretSealed: 1 } },
  )
  return res.modifiedCount > 0
}

export async function saveTemplateMapping(orgId: Types.ObjectId, registry: CustomerTemplateRegistry): Promise<void> {
  await WaConnection.updateOne({ orgId }, { $set: { templates: registry } })
}

export async function recordTest(orgId: Types.ObjectId, test: { ok: boolean; to: string; error?: string }): Promise<void> {
  await WaConnection.updateOne({ orgId }, { $set: { lastTest: { at: new Date(), ...test } } })
}

export type SenderConfig = Readonly<{ mode: WorkspaceMode; apiKey: string | null; templates: CustomerTemplateRegistry; botEnabled: boolean }>

/** What the sender needs; null when not connected. The key is opened here and never returned to a page. */
export async function senderConfig(orgId: Types.ObjectId | string): Promise<SenderConfig | null> {
  await dbConnect()
  const row = await WaConnection.findOne({ orgId, status: 'connected' }).select('+apiKeySealed').lean()
  if (!row) return null
  const key = encryptionKey()
  const apiKey = key && row.apiKeySealed ? openSecret(row.apiKeySealed, key) : null
  return { mode: row.mode === 'managed' ? 'managed' : 'byo', apiKey, templates: mergeCustomerTemplates(row.templates), botEnabled: Boolean(row.botEnabled) }
}

/** The workspace and webhook secret behind a webhook URL's key, or null (unknown, disconnected, or the secret cannot be opened). */
export async function connectionForHook(hookKey: string): Promise<{ orgId: Types.ObjectId; webhookSecret: string } | null> {
  const key = encryptionKey()
  if (!key || !HOOK_KEY.test(hookKey)) return null
  await dbConnect()
  const row = await WaConnection.findOne({ hookKey, status: 'connected' }).select('+webhookSecretSealed').lean()
  const webhookSecret = row ? openSecret(row.webhookSecretSealed, key) : null
  return row && webhookSecret ? { orgId: row.orgId, webhookSecret } : null
}

export async function touchConnection(orgId: Types.ObjectId): Promise<void> {
  await WaConnection.updateOne({ orgId }, { $set: { lastEventAt: new Date() } })
}
