import 'server-only'
import type { Types } from 'mongoose'
import { canWrite } from '@/lib/entitlements'
import { encryptionKey, serverEnv } from '@/lib/env'
import type { SystemDb } from '@/lib/platform'
import { openSecret } from '@/lib/secret-box'
import { LeadCapture } from '@/models/orbit/LeadCapture'
import { Org } from '@/models/Org'
import type { FetchLike } from '@/modules/payments/razorpay-links'
import { liveFetch } from '@/modules/whatsapp/platform-sender'
import { captureLead, type CaptureOutcome } from './create'
import { indiamartUrl, mapIndiamartResponse, mayPull, pullWindow, tallyPull } from './indiamart'

/**
 * /api/cron/lead-sources (every 15 minutes): pulls IndiaMART enquiries for
 * every workspace that switched it on, at most once per 5 minutes per key (as
 * IndiaMART requires). Each enquiry is captured once (its UNIQUE_QUERY_ID);
 * a failure is stored for the settings page and the next run tries again.
 */

export type PullOutcome = Readonly<{ created: number; duplicates: number; error?: string }>

/** The base URL can be pointed elsewhere (a sandbox, a proxy) with INDIAMART_API_URL. */
const baseUrl = (): string => serverEnv().INDIAMART_API_URL.trim()

export async function pullIndiamart(orgId: Types.ObjectId, fetchFn: FetchLike = liveFetch, now = new Date()): Promise<PullOutcome> {
  const key = encryptionKey()
  const row = await LeadCapture.findOne({ orgId, 'indiamart.enabled': true }).select('+indiamart.keySealed').lean()
  const crmKey = key && row?.indiamart?.keySealed ? openSecret(row.indiamart.keySealed, key) : null
  if (!row || !crmKey) return { created: 0, duplicates: 0, error: 'IndiaMART is not set up.' }
  if (!mayPull(row.indiamart?.lastAttemptAt, now)) return { created: 0, duplicates: 0 }
  // Claim the attempt first, so two runs never hit IndiaMART within 5 minutes.
  const claimed = await LeadCapture.updateOne({ _id: row._id, $or: [{ 'indiamart.lastAttemptAt': null }, { 'indiamart.lastAttemptAt': row.indiamart?.lastAttemptAt ?? null }] }, { $set: { 'indiamart.lastAttemptAt': now } })
  if (!claimed.modifiedCount) return { created: 0, duplicates: 0 }
  const window = pullWindow(row.indiamart?.lastPulledAt, now)
  const url = indiamartUrl(crmKey, window)
  const custom = baseUrl()
  let body: unknown
  try {
    const res = await fetchFn(custom ? url.replace(/^https:\/\/[^?]+/, custom) : url, { method: 'GET', headers: { accept: 'application/json' } })
    body = await res.json().catch(() => null)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'IndiaMART could not be reached.'
    await LeadCapture.updateOne({ _id: row._id }, { $set: { 'indiamart.lastError': message.slice(0, 300) } })
    return { created: 0, duplicates: 0, error: message }
  }
  const mapped = mapIndiamartResponse(body)
  if (!mapped.ok) {
    await LeadCapture.updateOne({ _id: row._id }, { $set: { 'indiamart.lastError': mapped.error.slice(0, 300) } })
    return { created: 0, duplicates: 0, error: mapped.error }
  }
  const outcomes: CaptureOutcome[] = []
  for (const draft of mapped.drafts) outcomes.push(await captureLead(orgId, draft))
  const tally = tallyPull(outcomes)
  // A refused lead keeps the window where it was, so the next run fetches it again.
  const set = tally.advance ? { 'indiamart.lastPulledAt': window.to, 'indiamart.lastError': '', 'indiamart.lastCount': tally.created } : { 'indiamart.lastError': tally.error.slice(0, 300), 'indiamart.lastCount': tally.created }
  await LeadCapture.updateOne({ _id: row._id }, { $set: set })
  return { created: tally.created, duplicates: tally.duplicates, ...(tally.error ? { error: tally.error } : {}) }
}

/** The IndiaMART loop starts no new workspace after this; the rest are pulled on the next run. */
export const LEAD_SOURCES_TIME_BUDGET_MS = 200_000

export async function runLeadSourcesJob(db: SystemDb, now = new Date(), clock: () => number = Date.now): Promise<{ workspaces: number; created: number; failed: number }> {
  const deadline = clock() + LEAD_SOURCES_TIME_BUDGET_MS
  const rows = await LeadCapture.find({ 'indiamart.enabled': true }, { orgId: 1 }).lean()
  const orgs = await db.raw(Org).find({ _id: { $in: rows.map((r) => r.orgId) }, deletedAt: null, disabled: { $ne: true } }).lean()
  let created = 0
  let failed = 0
  for (const org of orgs) {
    if (clock() > deadline) {
      console.warn('[lead-sources] time budget spent; the remaining workspaces are pulled next run')
      break
    }
    if (!canWrite(org as Parameters<typeof canWrite>[0], 'orbit', now)) continue
    try {
      const outcome = await pullIndiamart(org._id, liveFetch, now)
      created += outcome.created
      if (outcome.error) failed += 1
    } catch (error) {
      failed += 1
      console.error('[lead-sources] IndiaMART pull failed', String(org._id), error)
    }
  }
  return { workspaces: orgs.length, created, failed }
}
