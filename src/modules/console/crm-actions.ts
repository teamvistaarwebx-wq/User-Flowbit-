'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { fail, ok } from '@/lib/actions'
import { accountTypeOf } from '@/lib/account-types'
import { handoverProgress, HANDOVER_LABEL, HANDOVER_STEPS, setupStartRefusal, setupWeekStart } from '@/lib/console/handover'
import { consoleAction, type StaffCtx } from '@/lib/console/session'
import { effectiveStatus } from '@/lib/plans'
import { planConfig } from '@/modules/console/settings-query'
import { grantHours, SUPPORT_MODE_LABEL, SUPPORT_MODES } from '@/lib/console/support-access'
import { NotFoundError } from '@/lib/errors'
import { emailLayout, sendMail } from '@/lib/mail'
import { notify } from '@/lib/notify'
import { objectId } from '@/lib/validation'
import { Member } from '@/models/Member'
import { Org } from '@/models/Org'
import { User } from '@/models/User'
import { ConsoleAccount } from '@/models/console/ConsoleAccount'
import { Staff } from '@/models/console/Staff'
import { StaffAlert } from '@/models/console/StaffAlert'
import { SupportAccess } from '@/models/console/SupportAccess'

/** Console actions on an account: note, salesperson, handover checklist, support access request, alerts. */

const refresh = (orgId?: string) => {
  revalidatePath('/console', 'layout')
  if (orgId) revalidatePath(`/console/accounts/${orgId}`)
}

async function orgName(orgId: string, raw: <M extends typeof Org>(m: M) => M) {
  const org = await raw(Org).findById(orgId, { name: 1 }).lean()
  if (!org) throw new NotFoundError('That workspace')
  return org
}

export const addAccountNote = consoleAction('accounts.note', z.object({ orgId: objectId, text: z.string().trim().min(2, 'Write a note').max(2000, 'Keep it under 2,000 characters') }), async (input, p) => {
  const org = await orgName(input.orgId, p.raw)
  await p.raw(ConsoleAccount).updateOne({ orgId: org._id }, { $push: { notes: { $each: [{ text: input.text, staffId: p.staff.id, staffName: p.staff.name, at: new Date() }], $position: 0 } } }, { upsert: true })
  await p.audit({ action: 'console.note_added', summary: `Added a note on ${org.name}`, meta: { orgId: input.orgId } })
  refresh(input.orgId)
  return ok('Note added.')
})

export const assignSalesperson = consoleAction('accounts.assign', z.object({ orgId: objectId, staffId: z.union([objectId, z.literal('none')]) }), async (input, p) => {
  const org = await orgName(input.orgId, p.raw)
  const person = input.staffId === 'none' ? null : await p.raw(Staff).findOne({ _id: input.staffId, status: 'active', role: { $in: ['sales', 'admin'] } }, { name: 1 }).lean()
  if (input.staffId !== 'none' && !person) return fail('Pick an active Sales or Admin member.')
  await p.raw(ConsoleAccount).updateOne({ orgId: org._id }, person ? { $set: { salespersonId: person._id } } : { $unset: { salespersonId: 1 } }, { upsert: true })
  await p.audit({ action: 'console.salesperson_assigned', summary: person ? `Assigned ${org.name} to ${person.name}` : `Unassigned the salesperson of ${org.name}`, meta: { orgId: input.orgId } })
  refresh(input.orgId)
  return ok(person ? `${org.name} is now ${person.name}'s account.` : 'Salesperson removed.')
})

const done = z.union([z.boolean(), z.enum(['true', 'false'])]).transform((v) => v === true || v === 'true')

/**
 * Why a free setup cannot start for this workspace (yearly customers only, at
 * most the Console's setups per week; console spec 9), or null. A handover
 * already running is never refused.
 */
async function setupRefusal(p: StaffCtx, orgId: string): Promise<string | null> {
  const [org, account, config] = await Promise.all([
    p.raw(Org).findById(orgId, { subscription: 1 }).lean(),
    p.raw(ConsoleAccount).findOne({ orgId }, { handover: 1 }).lean(),
    planConfig(),
  ])
  if (!org) throw new NotFoundError('That workspace')
  const started = handoverProgress(account?.handover).started
  const startedThisWeek = started ? 0 : await p.raw(ConsoleAccount).countDocuments({ 'handover.startedAt': { $gte: setupWeekStart(new Date()) } })
  return setupStartRefusal({
    accountType: accountTypeOf(org.subscription),
    cycle: org.subscription?.cycle,
    status: effectiveStatus(org.subscription).status,
    started,
    startedThisWeek,
    cap: config.setupsPerWeek,
  })
}

export const setHandoverStep = consoleAction('handover.manage', z.object({ orgId: objectId, step: z.enum(HANDOVER_STEPS), done }), async (input, p) => {
  const org = await orgName(input.orgId, p.raw)
  const refusal = input.done ? await setupRefusal(p, input.orgId) : null
  if (refusal) return fail(refusal)
  const path = `handover.steps.${input.step}`
  await p.raw(ConsoleAccount).updateOne(
    { orgId: org._id },
    input.done ? { $set: { [path]: { doneAt: new Date(), doneBy: p.staff.id } }, $min: { 'handover.startedAt': new Date() } } : { $unset: { [path]: 1 } },
    { upsert: true },
  )
  await p.audit({ orgId: org._id, action: 'console.handover_step', entity: 'Org', summary: `Setup guide: "${HANDOVER_LABEL[input.step]}" ${input.done ? 'done' : 'reopened'}` })
  refresh(input.orgId)
  return ok(`${HANDOVER_LABEL[input.step]}: ${input.done ? 'done' : 'reopened'}.`)
})

export const startHandover = consoleAction('handover.manage', z.object({ orgId: objectId }), async (input, p) => {
  const org = await orgName(input.orgId, p.raw)
  const refusal = await setupRefusal(p, input.orgId)
  if (refusal) return fail(refusal)
  await p.raw(ConsoleAccount).updateOne({ orgId: org._id }, { $min: { 'handover.startedAt': new Date() } }, { upsert: true })
  await p.audit({ orgId: org._id, action: 'console.handover_started', entity: 'Org', summary: 'Setup with the Flowbit team started' })
  refresh(input.orgId)
  return ok(`Setup started for ${org.name}. They now see the Setup guide on Home.`)
})

/**
 * Asks the owner for support access (spec 8): read-only for up to 72 hours,
 * or 7 days of import-only access. Nothing opens until the owner approves.
 */
export const requestSupportAccess = consoleAction(
  'support.request',
  z.object({ orgId: objectId, mode: z.enum(SUPPORT_MODES).default('read'), hours: z.coerce.number().int().min(1).max(72).optional(), reason: z.string().trim().min(5, 'Give a reason of at least 5 characters').max(300) }),
  async (input, p) => {
    const org = await p.raw(Org).findById(input.orgId, { name: 1, subscription: 1 }).lean()
    if (!org) throw new NotFoundError('That workspace')
    if (input.mode === 'import' && !p.can('import.run')) return fail('Your role cannot run imports.')
    if (org.subscription?.accountType === 'internal' && !p.staff.isFounder) return fail('Only the founder can open the Internal workspace.')
    const scoped = p.forOrg(org._id)
    const open = await scoped.db(SupportAccess).exists({ staffId: p.staff.id, mode: input.mode, status: 'requested' })
    if (open) return fail('You already asked; the owner has not answered yet.')
    const hours = grantHours(input.mode, input.hours)
    await scoped.db(SupportAccess).create({ staffId: p.staff.id, staffName: p.staff.name, staffRole: p.staff.role, mode: input.mode, reason: input.reason, hours, status: 'requested' })
    const owner = await p.raw(Member).findOne({ orgId: org._id, role: 'owner', status: 'active' }, { userId: 1 }).lean()
    const label = SUPPORT_MODE_LABEL[input.mode].toLowerCase()
    if (owner) {
      const title = `Flowbit support asks for ${label} access`
      await notify({ orgId: org._id }, { userIds: [owner.userId], title, body: `${p.staff.name}: ${input.reason}`, href: '/app/settings/support', kind: 'approval', event: 'platform.support_access' })
      const user = await p.raw(User).findById(owner.userId, { email: 1 }).lean()
      if (user?.email) {
        const mail = emailLayout({ title, paragraphs: [`${p.staff.name} from the Flowbit team asks for ${label} access to ${org.name} for ${hours >= 48 ? `${Math.round(hours / 24)} days` : `${hours} hours`}.`, `Reason: ${input.reason}`, 'Nothing opens until you approve it. You can end it at any time.'], cta: { label: 'Review the request', href: '/app/settings/support' } })
        await sendMail({ to: user.email, subject: title, ...mail, orgId: org._id, kind: 'security' })
      }
    }
    await p.audit({ orgId: org._id, action: 'console.support_requested', entity: 'SupportAccess', summary: `${p.staff.name} asked for ${label} access`, meta: { reason: input.reason, hours } })
    refresh(input.orgId)
    return ok('Request sent. The owner gets an email and an alert in the app.')
  },
)

export const markAlertsRead = consoleAction('accounts.view', z.object({}), async (_input, p) => {
  await p.raw(StaffAlert).updateMany({ $or: [{ staffId: p.staff.id }, { staffId: null }], readAt: null }, { $set: { readAt: new Date() } })
  refresh()
  return ok('Alerts cleared.')
})
