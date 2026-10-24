'use server'

import { revalidatePath } from 'next/cache'
import type { Types } from 'mongoose'
import { z } from 'zod'
import { fail, ok } from '@/lib/actions'
import { dayBoundsIST, formatDate } from '@/lib/dates'
import { NotFoundError } from '@/lib/errors'
import { emailLayout, sendMail } from '@/lib/mail'
import { notify } from '@/lib/notify'
import { ACCOUNT_TYPES, ACCOUNT_TYPE_LABEL, accountTypeOf, accountTypeProblem } from '@/lib/account-types'
import { effectiveStatus, extraFolioFirms, READ_ONLY_DAYS } from '@/lib/plans'
import { consoleAction, type StaffCtx } from '@/lib/console/session'
import { claimTrialExtension, trialExtensionRefusal } from '@/lib/console/roles'
import { ADMIN_MAX_EXTENSION_DAYS, windowEndFields, windowWords } from '@/lib/console/extension-copy'
import { consoleExtensionStore } from '@/modules/console/trial-extension-store'
import { planConfig } from '@/modules/console/settings-query'
import { ConsoleAccount } from '@/models/console/ConsoleAccount'
import { isoDate, objectId, paise } from '@/lib/validation'
import { Member } from '@/models/Member'
import { Org } from '@/models/Org'
import { Session } from '@/models/Session'
import { User } from '@/models/User'
import { DemoRequest } from '@/models/marketing/DemoRequest'
import { SubscriptionInvoice } from '@/models/subscription/SubscriptionInvoice'
import { DEMO_REQUEST_STATUSES } from '@/modules/marketing/demo'
import { addedProducts, selectionLabel, selectionOf, type StoredProducts } from '@/modules/subscription/selection'
import { internalLocked } from '@/lib/console/support-access'
import { ADD_ONS, ADD_ON_LABEL } from '@/lib/addons'
import { OWNER_DELETE_PURGE_DAYS } from '@/lib/lifecycle'

const DAY_MS = 86_400_000
/** Owner-deleted workspaces can be restored until their data is removed (lib/lifecycle, D4). */
const RESTORE_DAYS = OWNER_DELETE_PURGE_DAYS
const reason = z.string().trim().min(5, 'Give a reason of at least 5 characters').max(300, 'Keep the reason under 300 characters')
const qty = z.coerce.number().int().min(0).max(100_000)

async function loadOrg(p: StaffCtx, orgId: string) {
  const org = await p.raw(Org).findById(orgId).lean()
  // The Internal workspace is founder-only (V2-REVIEW C2).
  if (!org || internalLocked(org.subscription?.accountType, p.staff.isFounder)) throw new NotFoundError('That workspace')
  return org
}

/** Notifies (and optionally emails) the workspace owner about a Flowbit change. */
async function tellOwner(p: StaffCtx, orgId: Types.ObjectId, title: string, email?: string) {
  const owner = await p.raw(Member).findOne({ orgId, role: 'owner', status: 'active' }, { userId: 1 }).lean()
  if (!owner) return
  await notify({ orgId }, { userIds: [owner.userId], title, href: '/app/settings/subscription', kind: 'system', event: 'platform.plan_changed' })
  if (!email) return
  const user = await p.raw(User).findById(owner.userId, { email: 1 }).lean()
  if (user?.email) {
    const mail = emailLayout({ title, paragraphs: [email], cta: { label: 'Open subscription', href: '/app/settings/subscription' } })
    await sendMail({ to: user.email, subject: title, ...mail, orgId, kind: 'subscription' })
  }
}

const refresh = (orgId: string) => {
  revalidatePath('/console', 'layout')
  revalidatePath(`/console/accounts/${orgId}`)
}

/**
 * Extends a trial or the Free window (spec 4.1): Sales once, by up to the
 * Console's extension days (15); Admin any number of times. The count lives
 * on the ConsoleAccount and is claimed atomically.
 */
export const extendTrial = consoleAction(
  'trial.extend_once',
  z.object({ orgId: objectId, days: z.coerce.number().int().min(1, 'At least 1 day').max(ADMIN_MAX_EXTENSION_DAYS, `At most ${ADMIN_MAX_EXTENSION_DAYS} days`), reason }),
  async (input, p) => {
    const org = await loadOrg(p, input.orgId)
    if (org.subscription?.plan !== 'trial') return fail('This workspace has a paid plan. Use Change plan instead.')
    const [account, config] = await Promise.all([p.raw(ConsoleAccount).findOne({ orgId: org._id }, { trialExtensions: 1 }).lean(), planConfig()])
    const refusal = trialExtensionRefusal(p.staff.role, { extensionsSoFar: account?.trialExtensions ?? 0, days: input.days, maxDays: config.salesExtensionDays })
    if (refusal) return fail(refusal, { days: refusal })
    const base = Math.max(org.subscription.trialEndsAt ? new Date(org.subscription.trialEndsAt).getTime() : 0, Date.now())
    const ends = new Date(base + input.days * DAY_MS)
    const type = accountTypeOf(org.subscription)
    const { noun } = windowWords(type)
    const claimed = await claimTrialExtension(consoleExtensionStore(p), { orgId: String(org._id), role: p.staff.role }, async () => {
      await p.raw(Org).updateOne({ _id: org._id }, { $set: { ...windowEndFields(type, ends), 'subscription.status': 'trialing' }, $unset: { 'subscription.endedAt': 1 } })
    })
    if (!claimed.ok) return fail(claimed.error, { days: claimed.error })
    await p.audit({ orgId: org._id, action: 'platform.trial_extended', entity: 'Subscription', summary: `${noun === 'trial' ? 'Trial' : 'Free plan'} extended to ${formatDate(ends)}`, meta: { reason: input.reason, days: input.days } })
    const yours = noun === 'trial' ? `Your free trial of ${org.name}` : `The Free plan for ${org.name}`
    await tellOwner(p, org._id, `Flowbit extended ${noun === 'trial' ? 'your trial' : 'your Free plan'} to ${formatDate(ends)}`, `${yours} now runs until ${formatDate(ends)}.`)
    refresh(input.orgId)
    return ok(`${noun === 'trial' ? 'Trial' : 'Free plan'} extended to ${formatDate(ends)} for ${org.name}.`)
  },
)

export const endTrialNow = consoleAction(
  'trial.end',
  z.object({ orgId: objectId, reason }),
  async (input, p) => {
    const org = await loadOrg(p, input.orgId)
    if (effectiveStatus(org.subscription).status !== 'trialing') return fail('Only a running trial can be ended.')
    const now = new Date()
    const type = accountTypeOf(org.subscription)
    const what = windowWords(type).noun === 'trial' ? 'Trial' : 'Free plan'
    await p.raw(Org).updateOne({ _id: org._id }, { $set: windowEndFields(type, now) })
    await p.audit({ orgId: org._id, action: 'platform.trial_ended', entity: 'Subscription', summary: `${what} ended by Flowbit`, meta: { reason: input.reason } })
    refresh(input.orgId)
    return ok(`${what} ended for ${org.name}. Read-only until ${formatDate(new Date(now.getTime() + READ_ONLY_DAYS * DAY_MS))}.`)
  },
)

const planSchema = z.object({
  orgId: objectId,
  plan: z.enum(['suite', 'custom']),
  seats: qty.optional(),
  work: qty.optional(),
  musterTier: z.enum(['none', 'starter', 'business']).default('none'),
  muster: qty.optional(),
  orbit: qty.optional(),
  /** Total Folio firms; omitted keeps the extras the workspace already pays for. */
  folioFirms: qty.optional(),
  folio: z.union([z.literal('true'), z.literal('false'), z.literal('on'), z.boolean()]).optional().transform((v) => v === true || v === 'true' || v === 'on'),
  cycle: z.enum(['monthly', 'yearly']),
  periodEnd: isoDate,
  amount: paise,
  reason,
})

/** Sets a plan by hand (no payment, no invoice). Minimums aren't enforced for staff. */
export const changePlanManually = consoleAction('account.set_plan', planSchema, async (input, p) => {
  const org = await loadOrg(p, input.orgId)
  const end = dayBoundsIST(input.periodEnd).end
  if (end <= new Date()) return fail('Choose a period end in the future.', { periodEnd: 'Pick a later date' })
  const suite = input.plan === 'suite'
  const products: StoredProducts = suite
    ? { work: true, muster: 'business', orbit: true, folio: true }
    : { work: Boolean(input.work), muster: input.musterTier === 'none' ? null : input.musterTier, orbit: Boolean(input.orbit), folio: input.folio }
  if (!suite && !products.work && !products.muster && !products.orbit && !products.folio) return fail('Choose at least one product.')
  const folioFirms = !products.folio ? 0 : input.folioFirms != null ? extraFolioFirms(input.folioFirms) : (org.subscription?.quantities?.folioFirms ?? 0)
  const quantities = suite ? { work: 0, muster: 0, orbit: 0, folioFirms } : { work: input.work ?? 0, muster: products.muster ? (input.muster ?? 0) : 0, orbit: input.orbit ?? 0, folioFirms }
  const seats = suite ? (input.seats ?? 0) : quantities.work
  const list = org.enabledProducts ?? []
  const enabledProducts = list.length ? [...new Set([...list, ...addedProducts((org.subscription?.products ?? null) as StoredProducts | null, products)])] : list
  await p.raw(Org).updateOne(
    { _id: org._id },
    {
      $set: {
        'subscription.status': 'active',
        'subscription.plan': input.plan,
        'subscription.products': products,
        'subscription.quantities': quantities,
        'subscription.seats': seats,
        'subscription.cycle': input.cycle,
        'subscription.amountPaise': input.amount,
        'subscription.currentPeriodStart': new Date(),
        'subscription.currentPeriodEnd': end,
        'subscription.cancelAtPeriodEnd': false,
        'subscription.manual': { note: input.reason, setBy: p.staff.id, setAt: new Date() },
        enabledProducts,
      },
      $unset: { 'subscription.pastDueSince': 1, 'subscription.endedAt': 1, 'subscription.canceledAt': 1, 'subscription.pendingChange': 1, 'subscription.pendingCheckout': 1 },
    },
  )
  const label = selectionLabel(selectionOf({ plan: input.plan, seats, products, quantities })!)
  await p.audit({ orgId: org._id, action: 'platform.plan_changed', entity: 'Subscription', summary: `Plan set by Flowbit: ${label}, ${input.cycle}, until ${formatDate(input.periodEnd)}`, meta: { reason: input.reason, amountPaise: input.amount } })
  await tellOwner(p, org._id, `Flowbit set your plan to ${label}`, `Your plan for ${org.name} is now ${label}, until ${formatDate(input.periodEnd)}.`)
  refresh(input.orgId)
  return ok(`${org.name} is now on ${label}.`)
})

/**
 * Sets the account type (console spec 4.1). Free and Trial need a workspace
 * without a bought plan, Paid needs one; Comped needs an end date. Internal and
 * Test leave every metric and reminder.
 */
export const setAccountType = consoleAction(
  'account.set_type',
  z.object({ orgId: objectId, accountType: z.enum(ACCOUNT_TYPES), compedUntil: isoDate.optional().or(z.literal('').transform(() => undefined)), reason }),
  async (input, p) => {
    const org = await loadOrg(p, input.orgId)
    if (internalLocked(input.accountType, p.staff.isFounder)) return fail('Only the founder can make a workspace Internal.')
    const until = input.compedUntil ? dayBoundsIST(input.compedUntil).end : null
    const problem = accountTypeProblem(input.accountType, { plan: org.subscription?.plan, compedUntil: until })
    if (problem) return fail(problem.message, problem.field ? { [problem.field]: problem.message } : undefined)
    const before = accountTypeOf(org.subscription)
    await p.raw(Org).updateOne(
      { _id: org._id },
      input.accountType === 'comped' ? { $set: { 'subscription.accountType': 'comped', 'subscription.compedUntil': until } } : { $set: { 'subscription.accountType': input.accountType }, $unset: { 'subscription.compedUntil': 1 } },
    )
    const label = ACCOUNT_TYPE_LABEL[input.accountType]
    await p.audit({ orgId: org._id, action: 'platform.account_type_changed', entity: 'Subscription', summary: `Account type set to ${label}${until ? ` until ${formatDate(until)}` : ''}`, meta: { reason: input.reason, before: { accountType: before }, after: { accountType: input.accountType } } })
    refresh(input.orgId)
    return ok(`${org.name} is now ${label}.`)
  },
)

const onFlag = z.preprocess((v) => v === 'on' || v === true || v === 'true', z.boolean())
const addOnFlags = Object.fromEntries(ADD_ONS.map((a) => [a, onFlag])) as Record<(typeof ADD_ONS)[number], typeof onFlag>

/** Paid add-ons (lib/addons): the client portal (included in Suite), Meetings AI and custom domains. */
export const setAddOns = consoleAction(
  'account.set_plan',
  z.object({ orgId: objectId, ...addOnFlags, reason }),
  async (input, p) => {
    const org = await loadOrg(p, input.orgId)
    const next = ADD_ONS.filter((a) => input[a])
    const before = [...(org.subscription?.addOns ?? [])]
    await p.raw(Org).updateOne({ _id: org._id }, { $set: { 'subscription.addOns': next } })
    const names = next.map((a) => ADD_ON_LABEL[a]).join(', ') || 'none'
    await p.audit({ orgId: org._id, action: 'platform.add_ons_changed', entity: 'Subscription', summary: `Add-ons set to ${names}`, meta: { reason: input.reason, before: { addOns: before }, after: { addOns: next } } })
    await tellOwner(p, org._id, `Add-ons for ${org.name}: ${names}`)
    refresh(input.orgId)
    return ok(`Add-ons for ${org.name}: ${names}.`)
  },
)

/** Sets the stored subscription status (support fixes); timestamps follow the status. */
export const setSubscriptionStatus = consoleAction(
  'account.set_status',
  z.object({ orgId: objectId, status: z.enum(['trialing', 'active', 'past_due', 'canceled', 'expired']), reason }),
  async (input, p) => {
    const org = await loadOrg(p, input.orgId)
    const sub = org.subscription
    const now = new Date()
    if (input.status === 'trialing' && (!sub?.trialEndsAt || new Date(sub.trialEndsAt) <= now)) return fail('The trial end is in the past. Use Extend trial instead.')
    if ((input.status === 'active' || input.status === 'canceled') && (!sub?.currentPeriodEnd || new Date(sub.currentPeriodEnd) <= now || sub.plan === 'trial')) return fail('There is no paid period running. Use Change plan first.')
    const extra: Record<string, unknown> =
      input.status === 'past_due' ? { 'subscription.pastDueSince': sub?.pastDueSince ?? now } : input.status === 'expired' ? { 'subscription.endedAt': now } : input.status === 'canceled' ? { 'subscription.canceledAt': now, 'subscription.cancelAtPeriodEnd': true } : {}
    await p.raw(Org).updateOne({ _id: org._id }, { $set: { 'subscription.status': input.status, ...extra } })
    await p.audit({ orgId: org._id, action: 'platform.status_changed', entity: 'Subscription', summary: `Subscription status set to ${input.status}`, meta: { reason: input.reason, before: { status: sub?.status }, after: { status: input.status } } })
    refresh(input.orgId)
    return ok(`Status set to ${input.status.replace('_', ' ')} for ${org.name}.`)
  },
)

export const setWorkspaceDisabled = consoleAction(
  'account.disable',
  z.object({ orgId: objectId, disabled: z.union([z.boolean(), z.enum(['true', 'false'])]).transform((v) => v === true || v === 'true'), reason, confirm: z.string().optional() }),
  async (input, p) => {
    const org = await loadOrg(p, input.orgId)
    if (input.disabled) {
      if ((input.confirm ?? '').trim().toLowerCase() !== org.slug) return fail(`Type ${org.slug} to confirm.`, { confirm: 'Type the workspace slug' })
      await p.raw(Org).updateOne({ _id: org._id }, { $set: { disabled: true, disabledAt: new Date(), disabledBy: p.staff.id, disabledReason: input.reason } })
      await p.raw(Session).updateMany({ activeOrgId: org._id }, { $unset: { activeOrgId: 1 } })
      await p.audit({ orgId: org._id, action: 'platform.workspace_disabled', entity: 'Org', summary: `Workspace disabled by Flowbit`, meta: { reason: input.reason } })
      refresh(input.orgId)
      return ok(`${org.name} disabled. Everyone was signed out of it.`)
    }
    await p.raw(Org).updateOne({ _id: org._id }, { $set: { disabled: false }, $unset: { disabledAt: 1, disabledBy: 1, disabledReason: 1 } })
    await p.audit({ orgId: org._id, action: 'platform.workspace_enabled', entity: 'Org', summary: 'Workspace enabled by Flowbit', meta: { reason: input.reason } })
    await tellOwner(p, org._id, `${org.name} is available again`)
    refresh(input.orgId)
    return ok(`${org.name} enabled.`)
  },
)

export const restoreWorkspace = consoleAction(
  'account.restore',
  z.object({ orgId: objectId, reason }),
  async (input, p) => {
    const org = await loadOrg(p, input.orgId)
    if (!org.deletedAt) return fail('This workspace is not deleted.')
    if (org.status === 'deleted') return fail('Its data has already been removed, so it can no longer be restored.')
    if (Date.now() - new Date(org.deletedAt).getTime() > RESTORE_DAYS * DAY_MS) return fail(`It was deleted more than ${RESTORE_DAYS} days ago and can no longer be restored.`)
    await p.raw(Org).updateOne({ _id: org._id }, { $unset: { deletedAt: 1 } })
    await p.audit({ orgId: org._id, action: 'platform.workspace_restored', entity: 'Org', summary: 'Deleted workspace restored by Flowbit', meta: { reason: input.reason } })
    refresh(input.orgId)
    return ok(`${org.name} restored.`)
  },
)

/** Cancels an invoice with a reason; the number stays in the series and the PDF says CANCELLED. */
export const cancelSubscriptionInvoice = consoleAction(
  'invoice.cancel',
  z.object({ invoiceId: objectId, reason }),
  async (input, p) => {
    const invoice = await p.raw(SubscriptionInvoice).findById(input.invoiceId).lean()
    if (!invoice) throw new NotFoundError('That invoice')
    if (invoice.status === 'cancelled') return fail('That invoice is already cancelled.')
    if (invoice.status === 'due') return fail('That is a due bill: cancel it from Console → Billing so its payment link is cancelled too.')
    await p.raw(SubscriptionInvoice).updateOne({ _id: invoice._id }, { $set: { status: 'cancelled', cancelledAt: new Date(), cancelReason: input.reason, cancelledBy: p.staff.id } })
    await p.audit({ orgId: invoice.orgId, action: 'platform.invoice_cancelled', entity: 'SubscriptionInvoice', entityId: invoice._id, summary: `Invoice ${invoice.number} cancelled by Flowbit`, meta: { reason: input.reason } })
    refresh(String(invoice.orgId))
    return ok(`Invoice ${invoice.number} cancelled.`)
  },
)

const DEMO_STATUS_LABEL: Record<(typeof DEMO_REQUEST_STATUSES)[number], string> = { new: 'new', contacted: 'contacted', closed: 'closed' }

/** Moves a /contact demo request along: new → contacted → closed (any order; staff correct mistakes). */
export const setDemoRequestStatus = consoleAction(
  'accounts.view',
  z.object({ id: objectId, status: z.enum(DEMO_REQUEST_STATUSES) }),
  async ({ id, status }, p) => {
    const row = await p.raw(DemoRequest).findOneAndUpdate({ _id: id }, { $set: { status } }, { returnDocument: 'after' }).lean()
    if (!row) throw new NotFoundError('That demo request')
    await p.audit({ action: 'console.demo_request_status', summary: `Demo request from ${row.company} marked ${DEMO_STATUS_LABEL[status]}` })
    revalidatePath('/console')
    return ok(`Demo request from ${row.name} (${row.company}) marked ${DEMO_STATUS_LABEL[status]}.`)
  },
)
