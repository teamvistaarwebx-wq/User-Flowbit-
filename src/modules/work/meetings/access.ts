import 'server-only'
import type { Ctx } from '@/lib/ctx'
import { NotFoundError, UserError } from '@/lib/errors'
import { Meeting } from '@/models/work/Meeting'

/** Meetings I organise or attend; everything with tasks.manage. */
export const meetingScope = (ctx: Ctx) => (ctx.can('tasks.manage') ? {} : { $or: [{ organizerId: ctx.memberId }, { 'attendees.memberId': ctx.memberId }] })

export async function loadMeeting(ctx: Ctx, id: string) {
  const meeting = await ctx.db(Meeting).findOne({ _id: id, ...meetingScope(ctx) }).lean()
  if (!meeting) throw new NotFoundError('That meeting')
  return meeting
}

export const isOrganizer = (ctx: Ctx, m: { organizerId: unknown }) => String(m.organizerId) === String(ctx.memberId)

/** Only the organiser (or a Work manager) changes the meeting itself. */
export function assertCanEdit(ctx: Ctx, m: { organizerId: unknown }) {
  if (!isOrganizer(ctx, m) && !ctx.can('tasks.manage')) throw new UserError('Only the organiser can change this meeting')
}

/** Attendees and the organiser can take notes and manage action items. */
export function assertParticipant(ctx: Ctx, m: { organizerId: unknown; attendees: { memberId: unknown }[] }) {
  const me = String(ctx.memberId)
  if (String(m.organizerId) !== me && !m.attendees.some((a) => String(a.memberId) === me) && !ctx.can('tasks.manage')) throw new UserError('Only people in this meeting can do that')
}
