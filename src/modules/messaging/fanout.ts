import 'server-only'
import { Types } from 'mongoose'
import { addDays, isoDateIST } from '@/lib/dates'
import { Member } from '@/models/Member'
import { Holiday } from '@/models/muster/Holiday'
import { LeaveRequest } from '@/models/muster/LeaveRequest'
import { Org } from '@/models/Org'
import { User } from '@/models/User'
import { groupForEvent, type ChannelSet, type EventGroup } from './events'
import { effectiveQuietHours, resolveChannels, type PersonalPrefs, type WorkspacePrefs } from './preferences'
import { choiceLabel, type ActionSubject } from '@/modules/actionlinks/kinds'
import { issueActionLinks } from '@/modules/actionlinks/store'
import { isWhatsAppConnected } from '@/modules/whatsapp/connection'
import { alertTemplateFor } from '@/modules/whatsapp/alert-templates'
import { canMessageOnWhatsApp } from '@/modules/whatsapp/recipients'
import { sendWorkspaceTemplate } from '@/modules/whatsapp/workspace-send'
import { loadPersonalPrefsMany, loadWorkspacePrefs } from './prefs-store'
import { enqueue, unsubscribeHeaders, unsubscribeUrl, type EnqueueAttachment } from './send'
import { holdUntil, offDatesOf } from './away'
import { alertEmail } from './templates'
import { isQuietAt, planEmail, quietEndsAt } from './timing'

/**
 * Fans one `notify()` event out over the channels each recipient allows:
 * in-app (the bell, written by notify itself), email, and WhatsApp from the
 * workspace's own number once it is connected (WhatsApp B: verified and
 * opted-in members only, approved templates only). Failures here are logged,
 * never thrown, so an alert can never break the action that raised it.
 */

export type AlertInput = Readonly<{
  event?: string
  title: string
  body?: string
  href?: string
  dedupeKey?: string
  email?: Readonly<{ paragraphs?: readonly string[]; attachments?: readonly EnqueueAttachment[] }>
  /** A request the recipient can decide from the message itself (signed one-time links, quick-reply buttons). */
  action?: ActionSubject
}>

/** `holdUntil`: the person is on leave or it is a holiday today; non-urgent email and WhatsApp wait until then. */
type Recipient = Readonly<{ userId: string; channels: ChannelSet; prefs: PersonalPrefs; holdUntil?: Date | null }>

export type Audience = Readonly<{
  group: EventGroup
  /** Users whose bell gets the alert. */
  inapp: readonly string[]
  recipients: readonly Recipient[]
  workspace: WorkspacePrefs
}>

const EVERYONE_INAPP = (group: EventGroup, userIds: readonly string[]): Audience => ({ group, inapp: userIds, recipients: [], workspace: { groups: [], quietHours: { enabled: false, start: '21:00', end: '08:00' } } })

/** Who gets the alert on which channel. On any error, everyone keeps the bell (the old behaviour). */
export async function audienceFor(orgId: Types.ObjectId, userIds: readonly string[], event: string | undefined): Promise<Audience> {
  const group = groupForEvent(event)
  if (!userIds.length || group.key === 'other') return EVERYONE_INAPP(group, userIds)
  try {
    const now = new Date()
    const [workspace, personal, whatsapp, away] = await Promise.all([loadWorkspacePrefs(orgId), loadPersonalPrefsMany(orgId, userIds), isWhatsAppConnected(orgId), group.urgent ? new Map<string, Date>() : awayUntil(orgId, userIds, now)])
    const available = { inapp: true, email: true, whatsapp }
    const recipients = userIds.map((userId) => {
      const prefs = personal.get(userId) ?? { groups: [], quietMode: 'workspace' as const, quietHours: workspace.quietHours, digest: 'off' as const, snoozeUntil: null }
      return { userId, prefs, channels: resolveChannels(group.key, workspace, prefs, available), holdUntil: away.get(userId) ?? null }
    })
    return { group, workspace, recipients, inapp: recipients.filter((r) => r.channels.inapp).map((r) => r.userId) }
  } catch (error) {
    console.error('[notify] could not resolve notification preferences', error)
    return EVERYONE_INAPP(group, userIds)
  }
}

export type FanoutOptions = Readonly<{
  /** Store the email for the messages cron instead of sending inside this request (cron and webhook callers). */
  defer?: boolean
  /** User ids whose in-app row already existed (a repeated dedupeKey): no second email either. */
  skipUserIds?: ReadonlySet<string>
}>

/** Sends (or holds, batches or skips) the alert email for every recipient who has email on. */
export async function sendAlertEmails(orgId: Types.ObjectId, audience: Audience, alert: AlertInput, opts: FanoutOptions = {}): Promise<number> {
  const wanted = audience.recipients.filter((r) => r.channels.email && !opts.skipUserIds?.has(r.userId))
  if (!wanted.length) return 0
  try {
    const [org, users] = await Promise.all([
      Org.findById(orgId, { name: 1 }).lean(),
      User.find({ _id: { $in: wanted.map((r) => new Types.ObjectId(r.userId)) } }, { email: 1, name: 1 }).lean(),
    ])
    const byId = new Map(users.map((u) => [String(u._id), u]))
    let sent = 0
    for (const r of wanted) {
      const user = byId.get(r.userId)
      if (!user?.email) continue
      sent += await sendOne(orgId, org?.name ?? 'your workspace', audience, r, user, alert, opts)
    }
    return sent
  } catch (error) {
    console.error('[notify] alert emails failed', alert.event, error)
    return 0
  }
}

/** Approve / Reject (or Mark done / Snooze) as signed one-time links bound to this recipient; none when that fails. */
async function actionButtons(orgId: Types.ObjectId, userId: string, subject: ActionSubject) {
  try {
    const links = await issueActionLinks(orgId, userId, subject, 'email')
    return links?.choices.map((c) => ({ label: choiceLabel(subject.kind, c), href: links.urls[c] ?? '', tone: c === 'reject' || c === 'snooze' ? ('secondary' as const) : ('primary' as const) }))
  } catch (error) {
    console.error('[notify] action links not issued', subject.kind, error)
    return undefined
  }
}

async function sendOne(orgId: Types.ObjectId, orgName: string, audience: Audience, r: Recipient, user: { email: string; name?: string | null }, alert: AlertInput, opts: FanoutOptions): Promise<number> {
  const now = new Date()
  const plan = planEmail({ now, group: audience.group, digest: r.prefs.digest, quiet: effectiveQuietHours(audience.workspace, r.prefs), snoozeUntil: r.prefs.snoozeUntil })
  const essential = Boolean(audience.group.urgent)
  // On leave or a holiday today: the email waits for the first working morning (a skip stays a skip).
  if (r.holdUntil && !essential && plan.kind !== 'skip') return sendHeld(orgId, orgName, audience, r, user, alert, r.holdUntil)
  // An email with its own attachment (a meeting's .ics) is held as itself, never folded into a digest.
  const holdAlone = plan.kind === 'digest' && Boolean(alert.email?.attachments?.length)
  // A digest folds alerts into one email without buttons; only an email of its own carries the signed links.
  const buttons = alert.action && (plan.kind === 'now' || holdAlone) ? await actionButtons(orgId, r.userId, alert.action) : undefined
  const mail = alertEmail(
    { title: alert.title, body: alert.body, href: alert.href, group: audience.group.key, paragraphs: alert.email?.paragraphs, buttons },
    { orgName, recipientName: user.name ?? undefined, unsubscribeUrl: essential ? undefined : unsubscribeUrl(orgId, user.email) },
  )
  const result = await enqueue({
    channel: 'email',
    to: user.email,
    orgId,
    userId: r.userId,
    event: alert.event,
    group: audience.group.key,
    kind: essential ? 'security' : 'alert',
    essential,
    ...mail,
    title: alert.title,
    body: alert.body,
    href: alert.href,
    attachments: alert.email?.attachments,
    headers: essential ? undefined : unsubscribeHeaders(orgId, user.email),
    dedupeKey: alert.dedupeKey,
    skipReason: plan.kind === 'skip' ? plan.reason : undefined,
    digestAt: plan.kind === 'digest' && !holdAlone ? plan.at : undefined,
    scheduledFor: plan.kind === 'digest' && holdAlone ? plan.at : undefined,
    note: plan.kind === 'digest' ? (plan.reason === 'quiet_hours' ? 'Held for quiet hours; goes in the morning digest' : 'Batched into a digest') : undefined,
    defer: plan.kind === 'now' && opts.defer,
  })
  return result.duplicate ? 0 : 1
}

/** The alert email for someone away today, scheduled for their first morning back (no action links: they would wait too). */
async function sendHeld(orgId: Types.ObjectId, orgName: string, audience: Audience, r: Recipient, user: { email: string; name?: string | null }, alert: AlertInput, at: Date): Promise<number> {
  const mail = alertEmail({ title: alert.title, body: alert.body, href: alert.href, group: audience.group.key, paragraphs: alert.email?.paragraphs }, { orgName, recipientName: user.name ?? undefined, unsubscribeUrl: unsubscribeUrl(orgId, user.email) })
  const result = await enqueue({
    channel: 'email', to: user.email, orgId, userId: r.userId, event: alert.event, group: audience.group.key, kind: 'alert', essential: false, ...mail,
    title: alert.title, body: alert.body, href: alert.href, attachments: alert.email?.attachments, headers: unsubscribeHeaders(orgId, user.email), dedupeKey: alert.dedupeKey,
    scheduledFor: at, note: 'Held: on leave or a holiday today',
  })
  return result.duplicate ? 0 : 1
}

/** People on approved leave or a company holiday today, with when they are back (holdUntil). Errors mean nobody is held. */
async function awayUntil(orgId: Types.ObjectId, userIds: readonly string[], now: Date): Promise<Map<string, Date>> {
  try {
    const today = isoDateIST(now)
    const end = addDays(today, 60)
    const [holidays, members] = await Promise.all([
      Holiday.find({ orgId, date: { $gte: today, $lte: end }, isOptional: { $ne: true } }, { date: 1 }).lean(),
      Member.find({ orgId, userId: { $in: userIds.map((id) => new Types.ObjectId(id)) }, status: 'active', employeeId: { $ne: null } }, { userId: 1, employeeId: 1 }).lean(),
    ])
    const holidayDates = holidays.map((h) => h.date)
    const leave = members.length ? await LeaveRequest.find({ orgId, employeeId: { $in: members.flatMap((m) => (m.employeeId ? [m.employeeId] : [])) }, status: 'approved', dates: { $gte: today, $lte: end } }, { employeeId: 1, dates: 1 }).lean() : []
    const leaveByEmployee = new Map<string, string[]>()
    for (const l of leave) leaveByEmployee.set(String(l.employeeId), [...(leaveByEmployee.get(String(l.employeeId)) ?? []), ...(l.dates ?? [])])
    const employeeOf = new Map(members.map((m) => [String(m.userId), String(m.employeeId)]))
    const out = new Map<string, Date>()
    for (const userId of userIds) {
      const off = offDatesOf(leaveByEmployee.get(employeeOf.get(userId) ?? '') ?? [], holidayDates)
      const until = holdUntil(now, off)
      if (until) out.set(userId, until)
    }
    return out
  } catch (error) {
    console.error('[notify] leave and holiday hold not checked', error)
    return new Map()
  }
}

/**
 * The WhatsApp copy of an alert for every recipient who turned WhatsApp on,
 * verified their number and opted in: the approved template only (payslips
 * become "payslip ready" with no amounts), held for quiet hours, skipped
 * while snoozed. Returns how many were queued or sent.
 */
export async function sendAlertWhatsApp(orgId: Types.ObjectId, audience: Audience, alert: AlertInput, opts: FanoutOptions = {}): Promise<number> {
  const wanted = audience.recipients.filter((r) => r.channels.whatsapp && !opts.skipUserIds?.has(r.userId))
  if (!wanted.length) return 0
  try {
    const [org, users] = await Promise.all([
      Org.findById(orgId, { name: 1 }).lean(),
      User.find({ _id: { $in: wanted.map((r) => new Types.ObjectId(r.userId)) } }, { name: 1, phone: 1, phoneVerifiedAt: 1, whatsapp: 1 }).lean(),
    ])
    const byId = new Map(users.map((u) => [String(u._id), u]))
    const now = new Date()
    let sent = 0
    for (const r of wanted) {
      const user = byId.get(r.userId)
      if (!user?.phone || !canMessageOnWhatsApp({ id: r.userId, phone: user.phone, phoneVerifiedAt: user.phoneVerifiedAt, whatsapp: user.whatsapp })) continue
      if (!audience.group.urgent && r.prefs.snoozeUntil && r.prefs.snoozeUntil.getTime() > now.getTime()) continue
      const template = alertTemplateFor(alert, { name: user.name ?? '', business: org?.name ?? 'your workspace' })
      if (!template) continue
      const quiet = audience.group.urgent ? null : effectiveQuietHours(audience.workspace, r.prefs)
      const quietUntil = quiet && isQuietAt(now, quiet) ? quietEndsAt(now, quiet) : undefined
      const scheduledFor = r.holdUntil && !audience.group.urgent ? r.holdUntil : quietUntil
      const links = alert.action ? await issueActionLinks(orgId, r.userId, alert.action, 'whatsapp', user.phone).catch(() => null) : null
      const result = await sendWorkspaceTemplate({ orgId, to: user.phone, key: template.key, values: template.values, extras: { buttonValue: template.buttonValue, payloads: links?.payloads }, kind: 'alert', event: alert.event, essential: false, userId: r.userId, dedupeKey: alert.dedupeKey ? `${alert.dedupeKey}:wa` : undefined, scheduledFor, defer: opts.defer, title: alert.title, body: alert.body, note: scheduledFor ? (r.holdUntil ? 'Held: on leave or a holiday today' : 'Held for quiet hours') : undefined })
      if (result.ok || result.status === 'queued' || result.status === 'scheduled') sent += 1
    }
    return sent
  } catch (error) {
    console.error('[notify] WhatsApp alerts failed', alert.event, error)
    return 0
  }
}
