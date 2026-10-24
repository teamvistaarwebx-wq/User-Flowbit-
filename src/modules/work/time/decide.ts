import 'server-only'
import { revalidatePath } from 'next/cache'
import { fail, ok, type ActionOptions, type ActionResult } from '@/lib/actions'
import { audit } from '@/lib/audit'
import type { Ctx } from '@/lib/ctx'
import { NotFoundError } from '@/lib/errors'
import { notifyMembers } from '@/lib/notify'
import { Member } from '@/models/Member'
import { TimeEntry } from '@/models/work/TimeEntry'
import { Timesheet } from '@/models/work/Timesheet'
import { weekLabel } from './week'

/** Approving or sending back a timesheet: the approvals page and approval links (email, WhatsApp) run this behind the same checks. */

export const TIMESHEET_DECIDE_OPTS: ActionOptions = { product: 'work', perm: 'time.approve' }

export const refreshTime = () => {
  revalidatePath('/app/work/time')
  revalidatePath('/app/work/time/approvals')
}

export async function decideTimesheet(ctx: Ctx, id: string, status: 'approved' | 'rejected', reason?: string): Promise<ActionResult> {
  const sheet = await ctx.db(Timesheet).findOne({ _id: id }).lean()
  if (!sheet) throw new NotFoundError('That timesheet')
  if (String(sheet.memberId) === String(ctx.memberId)) return fail("You can't approve your own timesheet")
  if (!ctx.can('org.manage') && String(sheet.approverId ?? '') !== String(ctx.memberId)) return fail('That timesheet goes to someone else to approve.')
  if (sheet.status !== 'submitted') return fail('Only submitted timesheets can be approved or sent back.')
  // Conditional on 'submitted': an email Reject racing an in-app approve must not both win.
  const claimed = await ctx.db(Timesheet).updateOne({ _id: sheet._id, status: 'submitted' }, { $set: { status, decidedAt: new Date(), decidedById: ctx.memberId, ...(reason ? { reason } : {}) } })
  if (!claimed.modifiedCount) return fail('This timesheet was already decided by someone else.')
  await ctx.db(TimeEntry).updateMany({ memberId: sheet.memberId, weekStart: sheet.weekStart }, { $set: { status } })
  const label = weekLabel(sheet.weekStart)
  const member = await ctx.db(Member).findById(sheet.memberId, { _id: 1 }).lean()
  if (member) {
    await notifyMembers(ctx, [member._id], {
      title: status === 'approved' ? `Your timesheet for ${label} was approved` : `Your timesheet for ${label} was sent back: ${reason}`,
      href: `/app/work/time?week=${sheet.weekStart}`,
      kind: status === 'approved' ? 'success' : 'warning',
      product: 'work',
      event: `timesheet.${status}`,
    })
  }
  await audit(ctx, { action: `timesheet.${status}`, entity: 'Timesheet', entityId: sheet._id, summary: `${status === 'approved' ? 'Approved' : 'Sent back'} timesheet for ${label}`, product: 'work', meta: reason ? { reason } : undefined })
  return ok(status === 'approved' ? `Timesheet for ${label} approved` : `Timesheet for ${label} sent back`)
}
