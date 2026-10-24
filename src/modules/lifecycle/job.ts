import 'server-only'
import { eachOrg, type CronOrg } from '@/lib/cron'
import { entitlements } from '@/lib/entitlements'
import { daysUntil, deletionDue, lifecycleOf, OWNER_DELETE_NOTICE_DAYS, ownerDeletionPurgeAt, ownerDeletionPurgeDue } from '@/lib/lifecycle'
import { flowbitSupplier } from '@/lib/env'
import { emailLayout } from '@/lib/mail'
import { daysSinceSignup, dueOnboardingStep, onboardingKey } from '@/lib/onboarding-steps'
import type { PlanConfig } from '@/lib/plan-config'
import type { SystemDb } from '@/lib/platform'
import { Member } from '@/models/Member'
import { Org } from '@/models/Org'
import { User } from '@/models/User'
import { ImportBatch } from '@/models/imports/ImportBatch'
import { UsageEvent } from '@/models/console/UsageEvent'
import { planConfig } from '@/modules/console/settings-query'
import { enqueue, unsubscribeHeaders, unsubscribeUrl } from '@/modules/messaging/send'
import { onboardingContent, ownerDeletionContent } from './content'
import { CLEAR_RESTORE, expiredRestoreFilter } from './import-restore'
import { returnToFree } from './plan-switch'
import { deletionEnabled, purgeSummary, purgeWorkspace } from './purge'
import { mongoPurgeStore } from './purge-store'
import { TENANT_COLLECTIONS } from './registry'
import { retentionEnabled, retentionSummary, runRetention } from '@/modules/privacy/retention'
import { ownerEmailOf } from '@/modules/subscription/reminders'
import { mongoRetentionStore } from '@/modules/privacy/retention-store'

/**
 * Daily lifecycle cron (/api/cron/lifecycle, console spec 4.3, 5.5), per
 * billed workspace: an ended trial already trimmed to 5 people goes back to
 * Free; the Day 1/3/7 onboarding email that is due; and, 90 days after
 * blocking, the data deletion. Then every owner-deleted workspace: a reminder
 * 7 days before, and its data removed 30 days after the owner deleted it (D4).
 * Deletion and log pruning run on a deployed production server and are a dry
 * run (logged, nothing removed) locally, in dev and on previews
 * (lib/live-jobs; LIFECYCLE_DELETE_ENABLED / RETENTION_PRUNE_ENABLED=false
 * stop them). Reminders and notices are the trial-reminders cron
 * (modules/subscription/reminders).
 */

/** Onboarding emails stop being considered after this many days. */
const ONBOARDING_LAST_DAY = 10

export type LifecycleOutcome = { freeRestored?: boolean; onboarding?: number; purge?: { apply: boolean; deleted: number; files: number } }

async function owner(db: SystemDb, org: CronOrg): Promise<{ userId: string; email: string } | null> {
  const member = await db.raw(Member).findOne({ orgId: org._id, role: 'owner', status: 'active' }, { userId: 1 }).sort({ joinedAt: 1 }).lean()
  const user = member ? await db.raw(User).findById(member.userId, { email: 1 }).lean() : null
  return member && user?.email ? { userId: String(member.userId), email: user.email } : null
}

async function sendOnboarding(db: SystemDb, org: CronOrg, now: Date): Promise<number | undefined> {
  if (!org.createdAt || daysSinceSignup(new Date(org.createdAt), now) > ONBOARDING_LAST_DAY) return undefined
  const done = new Set((await db.raw(UsageEvent).distinct('kind', { orgId: org._id })).map(String))
  const step = dueOnboardingStep({ createdAt: new Date(org.createdAt), now, done, products: entitlements(org, now).products })
  if (!step) return undefined
  const to = await owner(db, org)
  if (!to) return undefined
  const content = onboardingContent(step.day, org.name)
  const unsubscribe = unsubscribeUrl(org._id, to.email)
  const mail = emailLayout({ title: content.title, paragraphs: content.paragraphs, cta: content.cta, workspace: org.name, unsubscribeUrl: unsubscribe })
  await enqueue({ channel: 'email', to: to.email, userId: to.userId, orgId: org._id, subject: content.subject, ...mail, kind: 'onboarding', event: `onboarding.day_${step.day}`, dedupeKey: onboardingKey(step.day), headers: unsubscribeHeaders(org._id, to.email), defer: true })
  return step.day
}

async function restoreFree(db: SystemDb, org: CronOrg, now: Date, config: PlanConfig): Promise<boolean> {
  const lc = lifecycleOf(org, now)
  if (lc.accountType !== 'trial' || (lc.stage !== 'read_only' && lc.stage !== 'blocked')) return false
  const result = await returnToFree({ orgId: org._id, db: db.forOrg(org._id).db }, org, now, config)
  return result.ok
}

async function runForOrg(db: SystemDb, org: CronOrg, now: Date, apply: boolean, config: PlanConfig): Promise<LifecycleOutcome> {
  const freeRestored = await restoreFree(db, org, now, config)
  if (freeRestored) return { freeRestored }
  const onboarding = await sendOnboarding(db, org, now)
  if (!deletionDue(org, now)) return { onboarding }
  const report = await purgeWorkspace(mongoPurgeStore(), TENANT_COLLECTIONS, org._id, { apply, now })
  console.info(purgeSummary(report))
  return { onboarding, purge: { apply: report.apply, deleted: report.collections.reduce((sum, l) => sum + l.deleted, 0), files: report.files } }
}

/** Workspaces their owner deleted whose data is not removed yet (staff-disabled ones are held). */
const OWNER_DELETED = { deletedAt: { $ne: null }, status: { $ne: 'deleted' }, disabled: { $ne: true } } as const

const ownerDeletedOrgs = (db: SystemDb) => db.raw(Org).find(OWNER_DELETED, { name: 1, deletedAt: 1, status: 1, disabled: 1, subscription: 1 }).sort({ _id: 1 }).lean()
type OwnerDeletedOrg = Awaited<ReturnType<typeof ownerDeletedOrgs>>[number]

export type OwnerDeletedOutcome = { orgId: string; reminded?: boolean; purge?: { apply: boolean; deleted: number; files: number }; error?: string }

/** The owner and billing emails of a workspace, read before its data goes. */
async function recipients(db: SystemDb, org: OwnerDeletedOrg): Promise<string[]> {
  const billing = org.subscription?.billing?.email
  return [...new Set([await ownerEmailOf(db, org._id), billing].filter((e): e is string => Boolean(e)))]
}

async function sendOwnerDeletion(org: OwnerDeletedOrg, to: string[], stage: 'reminder' | 'purged', purgeAt: Date): Promise<void> {
  if (!to.length) return
  const content = ownerDeletionContent(stage, org.name, purgeAt, flowbitSupplier().supportEmail)
  const mail = emailLayout({ title: content.title, paragraphs: content.paragraphs, workspace: org.name })
  await enqueue({ channel: 'email', to, subject: content.subject, ...mail, orgId: org._id, kind: 'subscription', event: `workspace.owner_deleted_${stage}`, essential: true, dedupeKey: `owner-deleted:${stage}:${String(org._id)}`, defer: true, entity: 'Org', entityId: org._id })
}

/** One owner-deleted workspace: the 7-day reminder, then (30 days after deletion) the purge and its confirmation. */
async function runOwnerDeleted(db: SystemDb, org: OwnerDeletedOrg, now: Date, apply: boolean): Promise<OwnerDeletedOutcome | null> {
  const purgeAt = ownerDeletionPurgeAt(org)
  if (!purgeAt) return null
  const orgId = String(org._id)
  if (!ownerDeletionPurgeDue(org, now)) {
    if (daysUntil(purgeAt, now) > OWNER_DELETE_NOTICE_DAYS) return null
    await sendOwnerDeletion(org, await recipients(db, org), 'reminder', purgeAt)
    return { orgId, reminded: true }
  }
  const to = await recipients(db, org)
  const report = await purgeWorkspace(mongoPurgeStore(), TENANT_COLLECTIONS, org._id, { apply, now })
  console.info(purgeSummary(report))
  if (report.apply) await sendOwnerDeletion(org, to, 'purged', purgeAt)
  return { orgId, purge: { apply: report.apply, deleted: report.collections.reduce((sum, l) => sum + l.deleted, 0), files: report.files } }
}

/** Every owner-deleted workspace (B2): eachOrg skips deleted workspaces, so they get their own pass. A failure is logged; the others still run. */
async function ownerDeletedPass(db: SystemDb, now: Date, apply: boolean): Promise<OwnerDeletedOutcome[]> {
  const orgs = await ownerDeletedOrgs(db)
  const outcomes: OwnerDeletedOutcome[] = []
  for (const org of orgs) {
    try {
      const outcome = await runOwnerDeleted(db, org, now, apply)
      if (outcome) outcomes.push(outcome)
    } catch (error) {
      console.error(`[lifecycle] owner-deleted ${String(org._id)}`, error)
      outcomes.push({ orgId: String(org._id), error: 'This workspace’s purge failed; see the server log.' })
    }
  }
  return outcomes
}

/** Restore copies of imports that can no longer be undone (R3 L-30c): the count cleared, or null on error. */
async function clearExpiredImportRestores(db: SystemDb, now: Date): Promise<number | null> {
  try {
    return (await db.raw(ImportBatch).updateMany(expiredRestoreFilter(now), CLEAR_RESTORE)).modifiedCount ?? 0
  } catch (error) {
    console.error('[lifecycle] could not clear import restore copies', error)
    return null
  }
}

export async function runLifecycleJob(db: SystemDb, now: Date = new Date()) {
  const apply = deletionEnabled()
  const config = await planConfig()
  const orgs = await eachOrg(db, 'lifecycle', (org) => entitlements(org, now).billed, (org) => runForOrg(db, org, now, apply, config))
  const ownerDeleted = await ownerDeletedPass(db, now, apply)
  // Message and processing logs past retention (13 months, DPDP): live on a deployed production server (lib/live-jobs).
  const retention = await runRetention(mongoRetentionStore, { apply: retentionEnabled(), now }).catch((error: unknown) => {
    console.error('[retention] failed', error)
    return null
  })
  if (retention) console.info(retentionSummary(retention))
  const importRestoresCleared = await clearExpiredImportRestores(db, now)
  return { deletionEnabled: apply, orgs, ownerDeleted, retention, importRestoresCleared }
}
