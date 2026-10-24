import 'server-only'
import type { Types } from 'mongoose'
import { eachOrg } from '@/lib/cron'
import type { Ctx } from '@/lib/ctx'
import { entitlements } from '@/lib/entitlements'
import { dueNotice, type NoticeKind } from '@/lib/lifecycle-notices'
import { emailLayout } from '@/lib/mail'
import { notify, notifyPermission } from '@/lib/notify'
import type { OrgLike } from '@/lib/plans'
import type { SystemDb } from '@/lib/platform'
import { Member } from '@/models/Member'
import { User } from '@/models/User'
import { enqueue } from '@/modules/messaging/send'
import { noticeContent, SUBSCRIPTION_HREF } from '@/modules/lifecycle/content'
import { consoleSettings, planConfig } from '@/modules/console/settings-query'

/**
 * Lifecycle reminders (console spec 4.3, platform spec 6.5): Free ending
 * (30, 7, 1 days), trial ending (3, 1), read-only, blocked, and deletion
 * (30, 7, 1 days before). lib/lifecycle-notices picks the one due; its key
 * is the dedupeKey of both the bell row and the email, so running this from
 * every page load and from the daily cron sends each notice once. Emails go
 * through the message pipeline as essential mail (unsubscribe does not stop
 * them) to the owner and the billing email.
 */

type ReminderScope = Pick<Ctx, 'orgId' | 'db'> & {
  org: OrgLike & { name: string; subscription?: (OrgLike['subscription'] & { billing?: { email?: string | null } | null }) | null }
  /** The owner's email, looked up only when a notice is due. */
  ownerEmail: () => Promise<string | null>
  /** System callers (cron) leave the sending to the messages cron. */
  defer?: boolean
}

export type TrialReminderResult = 'none' | NoticeKind

const EVENT: Record<NoticeKind, string> = {
  free_ending: 'subscription.free_ending',
  trial_ending: 'subscription.trial_ending',
  read_only: 'subscription.read_only',
  blocked: 'subscription.blocked',
  deletion: 'subscription.deletion',
}

/** Everyone is told when the workspace stops being editable; countdowns go to people who can pay. */
const TELL_EVERYONE: ReadonlySet<NoticeKind> = new Set(['read_only', 'blocked'])

export async function lifecycleReminders(scope: ReminderScope, now: Date = new Date()): Promise<TrialReminderResult> {
  if (!entitlements(scope.org, now).billed) return 'none'
  const notice = dueNotice(scope.org, now)
  if (!notice) return 'none'
  const [settings, config] = await Promise.all([consoleSettings(), planConfig()])
  const content = noticeContent(notice, scope.org.name, { templates: settings.templates, freeSeats: config.freeSeats, yearlyDiscountPercent: config.yearlyDiscountPercent })
  const bell = { title: content.inApp, href: SUBSCRIPTION_HREF, kind: notice.kind === 'free_ending' || notice.kind === 'trial_ending' ? ('reminder' as const) : ('warning' as const), event: EVENT[notice.kind], dedupeKey: notice.key, includeSelf: true }
  if (TELL_EVERYONE.has(notice.kind)) {
    const members = await scope.db(Member).find({ status: 'active' }, { userId: 1 }).lean()
    await notify({ orgId: scope.orgId }, { ...bell, userIds: members.map((m) => m.userId) })
  } else {
    await notifyPermission({ orgId: scope.orgId }, 'billing.manage', bell)
  }
  const to = [...new Set([await scope.ownerEmail(), scope.org.subscription?.billing?.email].filter((e): e is string => Boolean(e)))]
  if (!to.length) return notice.kind
  const mail = emailLayout({ title: content.title, paragraphs: content.paragraphs, cta: content.cta, workspace: scope.org.name })
  await enqueue({ channel: 'email', to, subject: content.subject, ...mail, orgId: scope.orgId, kind: 'subscription', event: EVENT[notice.kind], essential: true, dedupeKey: notice.key, defer: scope.defer, entity: 'Org', entityId: scope.orgId })
  return notice.kind
}

/** The active owner's email, or null. */
export async function ownerEmailOf(db: SystemDb, orgId: Types.ObjectId): Promise<string | null> {
  const owner = await db.raw(Member).findOne({ orgId, role: 'owner', status: 'active' }, { userId: 1 }).sort({ joinedAt: 1 }).lean()
  if (!owner) return null
  const user = await db.raw(User).findById(owner.userId, { email: 1 }).lean()
  return user?.email ?? null
}

/** Called when the app shell loads (after the response); logs its own failures. */
export async function ensureTrialReminders(ctx: Ctx): Promise<void> {
  try {
    const ownerEmail = async () => {
      const owner = await ctx.db(Member).findOne({ role: 'owner', status: 'active' }, { userId: 1 }).sort({ joinedAt: 1 }).lean()
      const ownerUser = owner ? await User.findById(owner.userId, { email: 1 }).lean() : null
      return ownerUser?.email ?? null
    }
    await lifecycleReminders({ orgId: ctx.orgId, db: ctx.db, org: ctx.org, ownerEmail })
  } catch (error) {
    console.error('[subscription] lifecycle reminder failed', String(ctx.orgId), error)
  }
}

/** Daily cron: lifecycle reminders for every billed workspace, even when nobody opens the app. */
export async function runTrialReminders(db: SystemDb) {
  const orgs = await eachOrg(db, 'trial-reminders', (org) => entitlements(org).billed, async (org) =>
    lifecycleReminders({ orgId: org._id, db: db.forOrg(org._id).db, org, ownerEmail: () => ownerEmailOf(db, org._id), defer: true }),
  )
  return { orgs }
}
