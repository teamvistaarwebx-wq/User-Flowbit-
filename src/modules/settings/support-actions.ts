'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { action, fail, ok } from '@/lib/actions'
import { audit } from '@/lib/audit'
import type { Ctx } from '@/lib/ctx'
import { grantEndsAt, DPA_VERSION, SUPPORT_MODE_LABEL, supportStatus } from '@/lib/console/support-access'
import { formatDateTime } from '@/lib/dates'
import { NotFoundError } from '@/lib/errors'
import { emailLayout, sendMail } from '@/lib/mail'
import { objectId } from '@/lib/validation'
import { Org } from '@/models/Org'
import { SupportAccess } from '@/models/console/SupportAccess'

/**
 * The owner's side of support access (console spec 8, 9): approve or deny a
 * request from the Flowbit team, end running access, accept the DPA. Only the
 * workspace owner decides.
 */

const OPTS = { allowReadOnly: true } as const
const refresh = () => {
  revalidatePath('/app/settings/support')
  revalidatePath('/app', 'layout')
}

function assertOwner(ctx: Ctx): string | null {
  return ctx.isOwner ? null : 'Only the workspace owner can decide on Flowbit support access.'
}

async function load(ctx: Ctx, id: string) {
  const row = await ctx.db(SupportAccess).findById(id).lean()
  if (!row) throw new NotFoundError('That request')
  return row
}

async function emailOwner(ctx: Ctx, title: string, paragraphs: string[]) {
  const mail = emailLayout({ title, paragraphs, cta: { label: 'Review support access', href: '/app/settings/support' } })
  await sendMail({ to: ctx.user.email, subject: title, ...mail, orgId: ctx.orgId, kind: 'security' })
}

export const approveSupportAccess = action(z.object({ id: objectId }), async ({ id }, ctx) => {
  const refusal = assertOwner(ctx)
  if (refusal) return fail(refusal)
  const row = await load(ctx, id)
  if (row.status !== 'requested') return fail('That request was already answered.')
  if (row.mode === 'import' && !(ctx.org.dpa?.acceptedAt && ctx.org.dpa.version === DPA_VERSION)) return fail('Accept the data processing agreement first; it covers what the Flowbit team may do with your data.')
  const now = new Date()
  const expiresAt = grantEndsAt(row, now)
  const updated = await ctx.db(SupportAccess).updateOne({ _id: row._id, status: 'requested' }, { $set: { status: 'approved', decidedBy: ctx.userId, decidedAt: now, approvedAt: now, expiresAt } })
  if (!updated.modifiedCount) return fail('That request was already answered.')
  const label = SUPPORT_MODE_LABEL[row.mode].toLowerCase()
  await audit(ctx, { action: 'support.access_granted', entity: 'SupportAccess', entityId: row._id, summary: `Gave ${row.staffName} (Flowbit) ${label} access until ${formatDateTime(expiresAt)}`, meta: { reason: row.reason } })
  await emailOwner(ctx, `Flowbit support access is on until ${formatDateTime(expiresAt)}`, [`${row.staffName} from the Flowbit team now has ${label} access to ${ctx.org.name}.`, `Reason: ${row.reason}`, 'It ends on its own. You can end it sooner in Settings → Support access.'])
  refresh()
  return ok(`Access given until ${formatDateTime(expiresAt)}.`)
}, OPTS)

export const denySupportAccess = action(z.object({ id: objectId }), async ({ id }, ctx) => {
  const refusal = assertOwner(ctx)
  if (refusal) return fail(refusal)
  const row = await load(ctx, id)
  const updated = await ctx.db(SupportAccess).updateOne({ _id: row._id, status: 'requested' }, { $set: { status: 'denied', decidedBy: ctx.userId, decidedAt: new Date() } })
  if (!updated.modifiedCount) return fail('That request was already answered.')
  await audit(ctx, { action: 'support.access_denied', entity: 'SupportAccess', entityId: row._id, summary: `Declined ${row.staffName}'s request for Flowbit support access` })
  refresh()
  return ok('Request declined.')
}, OPTS)

export const endSupportAccess = action(z.object({ id: objectId }), async ({ id }, ctx) => {
  const refusal = assertOwner(ctx)
  if (refusal) return fail(refusal)
  const row = await load(ctx, id)
  if (supportStatus(row) !== 'active') return fail('That access is not running.')
  await ctx.db(SupportAccess).updateOne({ _id: row._id }, { $set: { status: 'revoked', decidedBy: ctx.userId, decidedAt: new Date(), expiresAt: new Date() } })
  await audit(ctx, { action: 'support.access_ended', entity: 'SupportAccess', entityId: row._id, summary: `Ended ${row.staffName}'s Flowbit support access` })
  refresh()
  return ok('Access ended.')
}, OPTS)

export const acceptDpa = action(z.object({ confirm: z.union([z.literal('on'), z.literal('true'), z.boolean()]) }), async (_input, ctx) => {
  const refusal = assertOwner(ctx)
  if (refusal) return fail(refusal)
  await Org.updateOne({ _id: ctx.orgId }, { $set: { dpa: { version: DPA_VERSION, acceptedAt: new Date(), acceptedBy: ctx.userId } } })
  await audit(ctx, { action: 'support.dpa_accepted', entity: 'Org', entityId: ctx.orgId, summary: `Accepted the data processing agreement (${DPA_VERSION})` })
  refresh()
  return ok('Data processing agreement accepted.')
}, OPTS)
