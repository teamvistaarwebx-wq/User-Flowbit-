import 'server-only'
import { Types } from 'mongoose'
import type { Ctx } from '@/lib/ctx'
import type { Permission } from '@/lib/catalog'
import { resolvePermissions } from '@/lib/permissions'
import { Member } from '@/models/Member'
import { Notification } from '@/models/Notification'
import { Role } from '@/models/Role'
import { audienceFor, sendAlertEmails, sendAlertWhatsApp, type AlertInput } from '@/modules/messaging/fanout'

export type NotificationKind = 'info' | 'assignment' | 'mention' | 'approval' | 'reminder' | 'success' | 'warning' | 'system'

export type NotifyInput = {
  userIds: Array<Types.ObjectId | string>
  title: string
  body?: string
  /** Where clicking the notification goes, e.g. '/app/work/tasks/abc'. */
  href?: string
  kind?: NotificationKind
  product?: string
  /** Fine-grained event for filters and icons: '<area>.<event>', e.g. 'task.assigned', 'subscription.trial_ending'. */
  event?: string
  /**
   * Idempotency key: each user gets at most one notification with this key in
   * this org, ever (e.g. 'trial-3d', `invoice-overdue:${id}:7d`). Repeat calls are no-ops.
   */
  dedupeKey?: string
  /** Also notify the person doing the action (default: skip them). */
  includeSelf?: boolean
  /** Extras for the alert email only: more paragraphs, attachments (a meeting's .ics). */
  email?: AlertInput['email']
  /** The request this alert asks someone to decide: its email gets signed Approve / Reject links, its WhatsApp copy quick-reply buttons. */
  action?: AlertInput['action']
}

type NotifyCtx = Pick<Ctx, 'orgId' | 'userId'> | { orgId: Types.ObjectId; userId?: Types.ObjectId | null }

/**
 * Raises an alert: the bell row (polled every 30 s, with a chime) and, per
 * each recipient's notification settings, an email (sent now, held for quiet
 * hours, batched into a digest, or skipped while snoozed). In-app stays the
 * default; `event` picks the settings group (modules/messaging/events.ts).
 * Returns how many in-app rows were created (a dedupeKey that already exists counts 0).
 */
export async function notify(ctx: NotifyCtx, input: NotifyInput): Promise<number> {
  const self = ctx.userId ? String(ctx.userId) : ''
  const ids = [...new Set(input.userIds.map(String))].filter((id) => input.includeSelf || id !== self)
  if (!ids.length) return 0
  const audience = await audienceFor(ctx.orgId, ids, input.event)
  const { created, existing } = await writeInApp(ctx.orgId, audience.inapp, input)
  const alert = { event: input.event, title: input.title, body: input.body, href: input.href, dedupeKey: input.dedupeKey, email: input.email, action: input.action }
  // System callers (crons, webhooks) leave the sending to the messages cron, so a long run is not slowed down.
  const opts = { defer: !ctx.userId, skipUserIds: existing }
  await sendAlertEmails(ctx.orgId, audience, alert, opts)
  await sendAlertWhatsApp(ctx.orgId, audience, alert, opts)
  return created
}

/** The bell rows. With a dedupeKey, users who already had that row are returned in `existing`. */
async function writeInApp(orgId: Types.ObjectId, ids: readonly string[], input: NotifyInput): Promise<{ created: number; existing: Set<string> }> {
  if (!ids.length) return { created: 0, existing: new Set() }
  const doc = (userId: string) => ({
    orgId,
    userId: new Types.ObjectId(userId),
    title: input.title,
    body: input.body,
    href: input.href,
    kind: input.kind ?? 'info',
    product: input.product,
    event: input.event,
  })
  if (!input.dedupeKey) {
    await Notification.insertMany(ids.map(doc))
    return { created: ids.length, existing: new Set() }
  }
  const result = await Notification.bulkWrite(
    ids.map((userId) => ({
      updateOne: {
        filter: { orgId, userId: new Types.ObjectId(userId), dedupeKey: input.dedupeKey },
        update: { $setOnInsert: { ...doc(userId), dedupeKey: input.dedupeKey } },
        upsert: true,
      },
    })),
    { ordered: false },
  )
  const inserted = new Set(Object.keys(result.upsertedIds ?? {}).map((index) => ids[Number(index)]))
  return { created: result.upsertedCount, existing: new Set(ids.filter((id) => !inserted.has(id))) }
}

/** Same as `notify`, addressed by Member ids (what product records store). */
export async function notifyMembers(ctx: NotifyCtx, memberIds: Array<Types.ObjectId | string>, input: Omit<NotifyInput, 'userIds'>): Promise<number> {
  if (!memberIds.length) return 0
  const members = await Member.find({ orgId: ctx.orgId, _id: { $in: memberIds }, status: 'active' }, { userId: 1 }).lean()
  return notify(ctx, { ...input, userIds: members.map((m) => m.userId) })
}

/** Notifies every active member holding one of the given roles (e.g. approvers). */
export async function notifyRoles(ctx: NotifyCtx, roles: string[], input: Omit<NotifyInput, 'userIds'>): Promise<number> {
  const members = await Member.find({ orgId: ctx.orgId, role: { $in: roles }, status: 'active' }, { userId: 1 }).lean()
  return notify(ctx, { ...input, userIds: members.map((m) => m.userId) })
}

/** Active members whose role (built-in or custom) holds `perm`, as User ids — e.g. every 'billing.manage' holder. */
export async function userIdsWithPermission(orgId: Types.ObjectId, perm: Permission): Promise<Types.ObjectId[]> {
  const [members, customRoles] = await Promise.all([
    Member.find({ orgId, status: 'active' }, { userId: 1, role: 1 }).lean(),
    Role.find({ orgId, builtIn: false }).lean(),
  ])
  return members.filter((m) => resolvePermissions(m.role, customRoles).has(perm)).map((m) => m.userId)
}

/** Notifies every active member whose role holds `perm` (custom roles included). */
export async function notifyPermission(ctx: NotifyCtx, perm: Permission, input: Omit<NotifyInput, 'userIds'>): Promise<number> {
  return notify(ctx, { ...input, userIds: await userIdsWithPermission(ctx.orgId, perm) })
}
