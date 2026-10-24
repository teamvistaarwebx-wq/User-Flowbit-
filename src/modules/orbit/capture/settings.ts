import 'server-only'
import { randomBytes } from 'node:crypto'
import type { Types } from 'mongoose'
import { dbConnect } from '@/lib/db'
import { appUrl, encryptionKey } from '@/lib/env'
import { openSecret } from '@/lib/secret-box'
import { LeadCapture } from '@/models/orbit/LeadCapture'
import type { AssignMode } from './assign'

/**
 * A workspace's lead-capture settings, created with fresh random keys on
 * first read. Keys in public URLs are 18 random bytes: they cannot be guessed
 * or walked, and regenerating one retires the old URL at once.
 */

const KEY = /^[A-Za-z0-9_-]{24}$/
export const newCaptureKey = (): string => randomBytes(18).toString('base64url')

export const leadFormUrl = (formKey: string): string => appUrl(`/api/public/leads/${formKey}`)
export const leadEmbedUrl = (formKey: string): string => appUrl(`/api/public/leads/${formKey}/embed.js`)
export const leadHookUrl = (hookKey: string): string => appUrl(`/api/webhooks/leads/${hookKey}`)

export type CaptureView = Readonly<{
  formKey: string
  formEnabled: boolean
  allowedOrigins: readonly string[]
  thankYouUrl: string
  hookKey: string
  hookEnabled: boolean
  hookTokenLast4: string
  assignMode: AssignMode
  ownerMemberId: string | null
  poolMemberIds: readonly string[]
  indiamart: Readonly<{ enabled: boolean; keyLast4: string; lastPulledAt: Date | null; lastError: string; lastCount: number }>
}>

export async function getLeadCapture(orgId: Types.ObjectId): Promise<CaptureView> {
  await dbConnect()
  const doc = await LeadCapture.findOneAndUpdate({ orgId }, { $setOnInsert: { formKey: newCaptureKey(), hookKey: newCaptureKey() } }, { upsert: true, returnDocument: 'after' }).lean()
  return {
    formKey: doc!.formKey,
    formEnabled: Boolean(doc!.formEnabled),
    allowedOrigins: doc!.allowedOrigins ?? [],
    thankYouUrl: doc!.thankYouUrl ?? '',
    hookKey: doc!.hookKey,
    hookEnabled: Boolean(doc!.hookEnabled),
    hookTokenLast4: doc!.hookTokenLast4 ?? '',
    assignMode: (doc!.assignMode as AssignMode) ?? 'owner',
    ownerMemberId: doc!.ownerMemberId ? String(doc!.ownerMemberId) : null,
    poolMemberIds: (doc!.poolMemberIds ?? []).map(String),
    indiamart: { enabled: Boolean(doc!.indiamart?.enabled), keyLast4: doc!.indiamart?.keyLast4 ?? '', lastPulledAt: doc!.indiamart?.lastPulledAt ?? null, lastError: doc!.indiamart?.lastError ?? '', lastCount: doc!.indiamart?.lastCount ?? 0 },
  }
}

/** The workspace behind a public form key, when the form is switched on. */
export async function captureByFormKey(formKey: string) {
  if (!KEY.test(formKey)) return null
  await dbConnect()
  return LeadCapture.findOne({ formKey, formEnabled: true }, { orgId: 1, allowedOrigins: 1, thankYouUrl: 1 }).lean()
}

/** The workspace and its webhook token behind a webhook key, when the webhook is switched on. */
export async function captureByHookKey(hookKey: string): Promise<{ orgId: Types.ObjectId; token: string } | null> {
  const key = encryptionKey()
  if (!key || !KEY.test(hookKey)) return null
  await dbConnect()
  const row = await LeadCapture.findOne({ hookKey, hookEnabled: true }).select('+hookTokenSealed').lean()
  const token = row ? openSecret(row.hookTokenSealed, key) : null
  return row && token ? { orgId: row.orgId, token } : null
}
