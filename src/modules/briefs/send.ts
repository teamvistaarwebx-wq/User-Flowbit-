import 'server-only'
import { Types, type InferSchemaType } from 'mongoose'
import type { SessionRecord, SessionUser } from '@/lib/auth/session'
import { buildCtx, isBlocked, type Ctx } from '@/lib/ctx'
import { formatDate, greeting } from '@/lib/dates'
import { firstName } from '@/lib/utils'
import { Brief } from '@/models/messaging/Brief'
import { Member } from '@/models/Member'
import { Org } from '@/models/Org'
import { Role } from '@/models/Role'
import { User } from '@/models/User'
import { planConfig } from '@/modules/console/settings-query'
import { enqueue, unsubscribeHeaders, unsubscribeUrl } from '@/modules/messaging/send'
import { canMessageOnWhatsApp } from '@/modules/whatsapp/recipients'
import { sendWorkspaceTemplate } from '@/modules/whatsapp/workspace-send'
import { buildBrief } from './build'
import { briefEmail } from './render'
import { shouldSendBrief } from './schedule'
import type { BriefFilters } from './sections-work'

/** Builds and sends one brief on its channels; the cron and "Send me a preview now" both use it. */

/** A brief as read with `.lean()`. */
export type BriefDoc = InferSchemaType<typeof Brief.schema> & { _id: Types.ObjectId }

export const filtersOf = (brief: Pick<BriefDoc, 'filters'>): BriefFilters => ({
  projectIds: (brief.filters?.projectIds ?? []).map(String),
  priorities: [...(brief.filters?.priorities ?? [])],
  tags: [...(brief.filters?.tags ?? [])],
  scope: (brief.filters?.scope as BriefFilters['scope']) ?? 'assigned',
})

/**
 * A member context without a browser session (cron), so a brief runs every
 * query with exactly the person's permissions and products. Null when the
 * person left, the workspace is gone or blocked.
 */
export async function memberCtxFor(orgId: Types.ObjectId, userId: Types.ObjectId): Promise<Ctx | null> {
  const [org, member, user, customRoles, config] = await Promise.all([
    Org.findById(orgId).lean(),
    Member.findOne({ orgId, userId, status: 'active' }).lean(),
    User.findById(userId).lean(),
    Role.find({ orgId, builtIn: false }).lean(),
    planConfig(),
  ])
  if (!org || org.deletedAt || !member || !user) return null
  const session = { _id: new Types.ObjectId(), userId: user._id, activeOrgId: org._id } as unknown as SessionRecord
  const ctx = buildCtx(user as SessionUser, session, org, member, customRoles, config)
  return isBlocked(ctx) ? null : ctx
}

export type BriefOutcome = Readonly<{ status: 'sent' | 'empty'; channels: string[] }>

export async function sendBrief(ctx: Ctx, brief: BriefDoc, opts: { today: string; preview?: boolean; now?: Date }): Promise<BriefOutcome> {
  const now = opts.now ?? new Date()
  const sections = await buildBrief(ctx, brief.sections ?? [], filtersOf(brief), opts.today)
  if (!opts.preview && !shouldSendBrief(sections, brief.skipIfEmpty !== false)) return { status: 'empty', channels: [] }
  const email = ctx.user.email
  const mail = briefEmail({
    name: brief.name,
    dateLabel: formatDate(opts.today, { withWeekday: true }),
    orgName: ctx.org.name,
    firstName: firstName(ctx.user.name) || ctx.user.name,
    greeting: greeting(now),
    sections,
    preview: opts.preview,
    unsubscribeUrl: unsubscribeUrl(ctx.orgId, email),
  })
  const common = { orgId: ctx.orgId, userId: ctx.userId, memberId: ctx.memberId, event: 'brief', group: 'brief', kind: 'brief', entity: 'Brief', entityId: brief._id, essential: false, defer: !opts.preview }
  const channels: string[] = []
  if (brief.channels?.email) {
    await enqueue({ ...common, channel: 'email', to: email, subject: mail.subject, html: mail.html, text: mail.text, headers: unsubscribeHeaders(ctx.orgId, email) })
    channels.push('email')
  }
  if (brief.channels?.inapp) {
    await enqueue({ ...common, channel: 'inapp', to: [String(ctx.userId)], title: `${opts.preview ? 'Preview: ' : ''}${brief.name}: ${mail.headline}`, body: mail.subject, href: '/app' })
    channels.push('in-app')
  }
  const optedIn = canMessageOnWhatsApp({ id: String(ctx.userId), phone: ctx.user.phone, phoneVerifiedAt: ctx.user.phoneVerifiedAt, whatsapp: ctx.user.whatsapp })
  if (brief.channels?.whatsapp && ctx.user.phone && optedIn) {
    // The short brief from the workspace's own number; the email copy goes instead when it cannot (unless email is already chosen).
    const fallback = brief.channels.email ? undefined : { to: [email], subject: mail.subject, html: mail.html, text: mail.text }
    await sendWorkspaceTemplate({ ...common, to: ctx.user.phone, key: 'morning_brief', values: { name: firstName(ctx.user.name), summary: mail.headline }, extras: { buttonValue: 'app' }, title: mail.subject, emailFallback: fallback })
    channels.push('WhatsApp')
  }
  return { status: 'sent', channels }
}
