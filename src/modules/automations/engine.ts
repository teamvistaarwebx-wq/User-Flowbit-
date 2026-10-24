import 'server-only'
import { Types } from 'mongoose'
import { dbConnect } from '@/lib/db'
import { Automation } from '@/models/automations/Automation'
import { AutomationRun } from '@/models/automations/AutomationRun'
import { loadWorkspacePrefs } from '@/modules/messaging/prefs-store'
import { executeRun } from './execute'
import { planRun, type RuleLike } from './plan'
import { ensureRecipes } from './seed'
import { webhookFromAutomation } from '@/modules/webhooks/events'
import { fireWebhookEvent } from '@/modules/webhooks/emit'
import type { RunSubject } from './types'

/**
 * The automation event bus (notifications-v2 §3.1). Product code calls
 * `emitEvent(orgId, 'payment.received', subject)` after its own work is
 * saved; every enabled rule for that event decides (plan.ts), stores one
 * run per record (dedupeKey) and, when nothing holds it back, executes it at
 * once. Delayed runs wait for /api/cron/automations. Never throws: an
 * automation problem must not undo the payment or quote that triggered it.
 */

type AutomationDoc = Awaited<ReturnType<typeof loadRules>>[number]

const loadRules = (filter: Record<string, unknown>) => Automation.find(filter).lean()

export const toRuleLike = (doc: AutomationDoc): RuleLike => ({
  id: String(doc._id),
  enabled: doc.enabled,
  trigger: doc.trigger as RuleLike['trigger'],
  conditions: (doc.conditions ?? []) as RuleLike['conditions'],
  actions: (doc.actions ?? []) as unknown as RuleLike['actions'],
  delayMinutes: doc.delayMinutes ?? 0,
  businessHoursOnly: Boolean(doc.businessHoursOnly),
  dailyCapPerContact: doc.dailyCapPerContact ?? 0,
})

const isDuplicateKey = (error: unknown) => (error as { code?: number } | null)?.code === 11000

export type StartOptions = Readonly<{ now?: Date; test?: { userId: Types.ObjectId | string } }>

/** Stores the run for one rule and one record, and executes it when it is due now. Returns the run id, or null when it did not fire. */
export async function startRun(doc: AutomationDoc, subject: RunSubject, opts: StartOptions = {}): Promise<string | null> {
  const now = opts.now ?? new Date()
  const workspace = opts.test ? null : await loadWorkspacePrefs(doc.orgId)
  const plan = planRun(toRuleLike(doc), subject, { now, quiet: workspace?.quietHours ?? null, test: Boolean(opts.test) })
  if (!plan.fire) return null
  let run
  try {
    run = await AutomationRun.create({
      orgId: doc.orgId,
      automationId: doc._id,
      recipeKey: doc.recipeKey,
      dedupeKey: plan.dedupeKey ?? undefined,
      entity: subject.entity,
      entityId: subject.entityId,
      status: 'scheduled',
      dueAt: plan.dueAt,
      vars: subject.vars,
      refs: subject.refs,
      test: Boolean(opts.test),
      testUserId: opts.test ? new Types.ObjectId(String(opts.test.userId)) : undefined,
    })
  } catch (error) {
    if (isDuplicateKey(error)) return null
    throw error
  }
  if (plan.dueAt.getTime() <= now.getTime()) await executeRun(run._id)
  return String(run._id)
}

/** Fires an event for one record. Safe to call from any request or job; failures are logged, never thrown. */
/**
 * Starts the event's rules for `subject`. Outbound webhooks are per record:
 * `webhookSubjects` (default: the subject itself) are the records they report,
 * e.g. each invoice of a receipt that paid several.
 */
export async function emitEvent(orgId: Types.ObjectId | string, key: string, subject: RunSubject, webhookSubjects: readonly RunSubject[] = [subject]): Promise<void> {
  for (const one of webhookSubjects) {
    const hook = webhookFromAutomation(key, one)
    if (hook) fireWebhookEvent(orgId, hook.event, hook.data)
  }
  try {
    await dbConnect()
    const org = new Types.ObjectId(String(orgId))
    await ensureRecipes(org)
    const rules = await loadRules({ orgId: org, enabled: true, 'trigger.type': 'event', 'trigger.event': key })
    for (const rule of rules) {
      try {
        await startRun(rule, subject)
      } catch (error) {
        console.error('[automations] run failed', key, String(rule._id), error)
      }
    }
  } catch (error) {
    console.error('[automations] event failed', key, String(orgId), error)
  }
}
