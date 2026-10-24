'use server'

import { Types } from 'mongoose'
import { z } from 'zod'
import { fail, ok } from '@/lib/actions'
import { isoDate } from '@/lib/validation'
import { serverEnv } from '@/lib/env'
import { consoleAction } from '@/lib/console/session'
import { emailLayout, sendMail } from '@/lib/mail'
import { notify } from '@/lib/notify'
import { Member } from '@/models/Member'
import { Org } from '@/models/Org'
import { User } from '@/models/User'
import { breachNoticeContent, MAX_BREACH_WORKSPACES, parseWorkspaceList } from './breach-notice'

const text = (label: string, max: number) => z.string().trim().min(10, `Describe ${label} (10 characters or more)`).max(max)

/**
 * Console → Incidents (Admin): emails the active owners of the listed
 * workspaces the breach notice of docs/BREACH-RUNBOOK.md. Essential mail
 * (no unsubscribe), a bell row, and an entry in each workspace's audit log
 * and the staff audit. Sent once per workspace and reference.
 */
export const notifyBreachOwners = consoleAction(
  'breach.notify',
  z.object({
    reference: z.string().trim().regex(/^[A-Za-z0-9-]{3,40}$/, 'Use letters, digits and dashes, e.g. INC-2026-001'),
    discoveredOn: isoDate,
    workspaces: z.string().trim().min(1, 'List the affected workspaces'),
    whatHappened: text('what happened', 2000),
    dataAffected: text('the data affected', 2000),
    whatWeDid: text('what Flowbit did', 2000),
    whatYouShouldDo: text('what owners should do', 2000),
    confirm: z.union([z.literal('on'), z.literal('true'), z.literal(true)], { error: 'Tick the box to confirm the list and the wording' }),
  }),
  async (input, p) => {
    const list = parseWorkspaceList(input.workspaces)
    if (!list.ids.length && !list.slugs.length) return fail('No workspace ids or slugs found in the list.', { workspaces: 'One workspace id or slug per line' })
    if (list.ids.length + list.slugs.length > MAX_BREACH_WORKSPACES) return fail(`At most ${MAX_BREACH_WORKSPACES} workspaces per notice. Split the list.`)
    const orgs = await p.raw(Org).find({ $or: [{ _id: { $in: list.ids.map((id) => new Types.ObjectId(id)) } }, { slug: { $in: list.slugs } }], deletedAt: null }, { name: 1, slug: 1 }).lean()
    const found = new Set(orgs.flatMap((o) => [String(o._id), o.slug]))
    const missing = [...list.ids, ...list.slugs].filter((t) => !found.has(t))
    if (missing.length) return fail(`Not found: ${missing.slice(0, 10).join(', ')}${missing.length > 10 ? ` and ${missing.length - 10} more` : ''}. Fix the list and send again.`, { workspaces: 'Some workspaces were not found' })
    const support = serverEnv().SUPPORT_EMAIL
    let sent = 0
    for (const org of orgs) {
      const owners = await p.raw(Member).find({ orgId: org._id, role: 'owner', status: 'active' }, { userId: 1 }).lean()
      const users = await p.raw(User).find({ _id: { $in: owners.map((o) => o.userId) } }, { email: 1 }).lean()
      const content = breachNoticeContent(input, org.name, support)
      const mail = emailLayout({ title: content.title, paragraphs: content.paragraphs })
      for (const user of users) {
        if (!user.email) continue
        const result = await sendMail({ to: user.email, subject: content.subject, ...mail, orgId: org._id, kind: 'security', entity: 'Org', entityId: org._id })
        if (result.ok || result.provider === 'outbox') sent += 1
      }
      await notify({ orgId: org._id }, { userIds: owners.map((o) => o.userId), title: `Security notice from Flowbit (${input.reference})`, body: 'Check your email: an incident affected data in this workspace.', href: '/app/settings/privacy', kind: 'warning', event: 'platform.security_notice', dedupeKey: `breach:${input.reference}`, includeSelf: true })
      await p.audit({ orgId: org._id, action: 'console.breach_notice_sent', entity: 'Org', summary: `Security notice ${input.reference} sent to the owners`, meta: { reference: input.reference, discoveredOn: input.discoveredOn, owners: users.length } })
    }
    await p.audit({ action: 'console.breach_notice', summary: `Security notice ${input.reference} sent to ${orgs.length} workspace${orgs.length === 1 ? '' : 's'} (${sent} owner emails)`, meta: { reference: input.reference, workspaces: orgs.map((o) => String(o._id)) } })
    return ok(`Notice ${input.reference} sent to ${sent} owner${sent === 1 ? '' : 's'} in ${orgs.length} workspace${orgs.length === 1 ? '' : 's'}.`)
  },
)
