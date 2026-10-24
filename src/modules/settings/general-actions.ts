'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { action, fail, ok } from '@/lib/actions'
import { audit } from '@/lib/audit'
import { formatWorkWeek, parseHHMM } from '@/lib/dates'
import { flowbitSupplier, razorpayMode } from '@/lib/env'
import { ownerDeletionPurgeAt } from '@/lib/lifecycle'
import { emailLayout } from '@/lib/mail'
import { UserError } from '@/lib/errors'
import { WORKING_HOURS_IN_HR } from '@/lib/working-hours'
import { hhmm, slug } from '@/lib/validation'
import { RESERVED_SLUGS, TEAM_SIZE_VALUES, WORKSPACE_KINDS, WORKSPACE_MODES, isSlugAvailable } from '@/lib/workspace'
import { kindChangeNote, workspaceKindOf, WORKSPACE_KIND_DEFS } from '@/lib/workspace-kind'
import { Org } from '@/models/Org'
import { Session } from '@/models/Session'
import { cancelRazorpaySubscription } from '@/modules/subscription/razorpay'
import { ownerDeletionContent } from '@/modules/lifecycle/content'
import { enqueue } from '@/modules/messaging/send'

const SLUG_MAX = 40

const done = (message: string) => {
  revalidatePath('/app', 'layout')
  return ok(message)
}

const workspaceSchema = z.object({
  name: z.string().trim().min(2, 'Use at least 2 characters').max(60, 'Use at most 60 characters'),
  slug: slug.refine((s) => s.length <= SLUG_MAX, `Use at most ${SLUG_MAX} characters`),
  teamSize: z.enum(TEAM_SIZE_VALUES),
  mode: z.enum(WORKSPACE_MODES),
  workspaceKind: z.enum(WORKSPACE_KINDS),
})

/** Name, URL, team size, working mode and (owner only) the workspace type. */
export const updateWorkspace = action(
  workspaceSchema,
  async (input, ctx) => {
    if (input.slug !== ctx.org.slug) {
      if (RESERVED_SLUGS.has(input.slug)) return fail('Choose another URL.', { slug: 'That URL is reserved.' })
      if (!(await isSlugAvailable(input.slug))) return fail('Choose another URL.', { slug: 'That URL is taken.' })
    }
    const kind = workspaceKindOf(ctx.org)
    const kindChanged = input.workspaceKind !== kind
    if (kindChanged && !ctx.isOwner) return fail('Only the owner can change the workspace type.', { workspaceKind: 'Only the owner can change this' })
    const before = { name: ctx.org.name, slug: ctx.org.slug, teamSize: ctx.org.teamSize, mode: ctx.org.mode, workspaceKind: kind }
    // Products the old type hid come back switched on (they were hidden by the type, not switched off by anyone).
    const list = ctx.org.enabledProducts ?? []
    const enabledProducts = kindChanged && list.length ? [...new Set([...list, ...WORKSPACE_KIND_DEFS[input.workspaceKind].products.filter((p) => !WORKSPACE_KIND_DEFS[kind].products.includes(p))])] : null
    await Org.updateOne({ _id: ctx.orgId }, { $set: { ...input, ...(enabledProducts ? { enabledProducts } : {}) } })
    await audit(ctx, { action: 'org.updated', entity: 'Org', entityId: ctx.orgId, summary: kindChanged ? `Workspace type changed to ${WORKSPACE_KIND_DEFS[input.workspaceKind].label}` : `Workspace details saved for ${input.name}`, changes: { before, after: input } })
    const note = kindChanged ? kindChangeNote(kind, input.workspaceKind) : null
    return done(kindChanged ? `Workspace type is now ${WORKSPACE_KIND_DEFS[input.workspaceKind].label}.${note ? ` ${note}` : ''}` : 'Workspace details saved.')
  },
  { perm: 'org.manage' },
)

export type SlugStatus = 'current' | 'available' | 'taken' | 'reserved' | 'invalid'

/** Live check for the workspace URL field. */
export const checkWorkspaceSlug = action(
  z.object({ slug: z.string().max(80) }),
  async (input, ctx) => {
    const parsed = slug.safeParse(input.slug)
    const value = parsed.success ? parsed.data : ''
    const status: SlugStatus = !parsed.success || value.length > SLUG_MAX ? 'invalid' : value === ctx.org.slug ? 'current' : RESERVED_SLUGS.has(value) ? 'reserved' : (await isSlugAvailable(value)) ? 'available' : 'taken'
    return ok(undefined, { status })
  },
  { perm: 'org.manage', allowReadOnly: true },
)

const calendarSchema = z
  .object({
    start: hhmm,
    end: hhmm,
    halfDayHours: z.coerce.number({ error: 'Enter hours' }).min(0.5, 'At least 0.5 hours').max(12, 'At most 12 hours').multipleOf(0.5, 'Use steps of half an hour'),
    workWeek: z.preprocess((v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]), z.array(z.coerce.number().int().min(0).max(6)).min(1, 'Choose at least one working day')),
  })
  .superRefine((v, issue) => {
    const minutes = parseHHMM(v.end) - parseHHMM(v.start)
    if (minutes <= 0) issue.addIssue({ code: 'custom', path: ['end'], message: 'The day must end after it starts' })
    else if (v.halfDayHours * 60 >= minutes) issue.addIssue({ code: 'custom', path: ['halfDayHours'], message: 'Half a day must be shorter than the office day' })
  })

/** Office hours and the work week (check-in widget, attendance, payroll days). */
export const saveWorkingCalendar = action(
  calendarSchema,
  async (input, ctx) => {
    // One place to edit working hours (audit A1/A13): with Muster on, that is HR settings → Attendance rules.
    if (ctx.has('muster')) return fail(WORKING_HOURS_IN_HR)
    const workWeek = [...new Set(input.workWeek)].sort((a, b) => a - b)
    const before = { officeHours: ctx.org.officeHours, workWeek: ctx.org.workWeek }
    await Org.updateOne({ _id: ctx.orgId }, { $set: { 'officeHours.start': input.start, 'officeHours.end': input.end, 'officeHours.halfDayHours': input.halfDayHours, workWeek } })
    await audit(ctx, { action: 'org.updated', entity: 'Org', entityId: ctx.orgId, summary: `Working hours set to ${input.start}–${input.end}, ${formatWorkWeek(workWeek)}`, changes: { before, after: { officeHours: { ...ctx.org.officeHours, start: input.start, end: input.end, halfDayHours: input.halfDayHours }, workWeek } } })
    return done(`Working hours saved: ${input.start}–${input.end}, ${formatWorkWeek(workWeek)}.`)
  },
  { perm: 'org.manage' },
)

/**
 * Owner only: soft-deletes the workspace, signs everyone out of it and emails
 * the owner when its data goes: the lifecycle job removes it 30 days later
 * (D4, lib/lifecycle ownerDeletionPurgeDue); staff can restore it until then.
 */
export const deleteWorkspace = action(
  z.object({ confirm: z.string() }),
  async ({ confirm }, ctx) => {
    if (!ctx.isOwner) return fail('Only the workspace owner can delete it.')
    if (confirm.trim().toLowerCase() !== ctx.org.slug) throw new UserError(`Type ${ctx.org.slug} to confirm.`)
    const subId = ctx.org.subscription?.razorpaySubscriptionId
    if (subId && razorpayMode() !== 'none') await cancelRazorpaySubscription(subId, false).catch((error) => console.error('[settings] could not cancel Razorpay on delete', error))
    const deletedAt = new Date()
    await Org.updateOne({ _id: ctx.orgId }, { $set: { deletedAt } })
    const purgeAt = ownerDeletionPurgeAt({ deletedAt })!
    await audit(ctx, { action: 'org.deleted', entity: 'Org', entityId: ctx.orgId, summary: `Workspace ${ctx.org.name} deleted by the owner; data removed on ${purgeAt.toISOString().slice(0, 10)}` })
    const content = ownerDeletionContent('deleted', ctx.org.name, purgeAt, flowbitSupplier().supportEmail)
    await enqueue({ channel: 'email', to: ctx.user.email, subject: content.subject, ...emailLayout({ title: content.title, paragraphs: content.paragraphs, workspace: ctx.org.name }), orgId: ctx.orgId, kind: 'subscription', event: 'workspace.owner_deleted', essential: true, dedupeKey: `owner-deleted:deleted:${String(ctx.orgId)}:${deletedAt.getTime()}`, entity: 'Org', entityId: ctx.orgId }).catch((error: unknown) => console.error('[settings] could not email the deletion notice', error))
    await Session.updateMany({ activeOrgId: ctx.orgId }, { $unset: { activeOrgId: 1 } })
    revalidatePath('/app', 'layout')
    return ok(`${ctx.org.name} was deleted.`, undefined, '/app')
  },
  { perm: 'org.delete', allowReadOnly: true, allowBlocked: true },
)
