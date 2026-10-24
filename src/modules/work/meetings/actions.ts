'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { action, fail, ok } from '@/lib/actions'
import { audit } from '@/lib/audit'
import { formatDate, formatTime } from '@/lib/dates'
import { notifyMembers } from '@/lib/notify'
import { hhmm, isoDate, listOf, objectId, optionalText, requiredText } from '@/lib/validation'
import { Meeting } from '@/models/work/Meeting'
import { assertActiveMembers } from '../teams/people'
import { assertCanEdit, assertParticipant, loadMeeting } from './access'
import { cancelGoogleEvent, syncMeetingToGoogle } from './google-sync'
import { meetingEmail } from './invite-mail'
import { meetingLink } from './link'
import { meetingTimes, mergeAttendees } from './schedule'

const W = { product: 'work' } as const

const meetingSchema = z.object({
  title: requiredText('Title', 150),
  agenda: optionalText(5000),
  date: isoDate,
  start: hhmm,
  end: hhmm,
  location: optionalText(200),
  link: meetingLink,
  attendeeIds: listOf(objectId).refine((v) => v.length > 0, 'Pick at least one attendee'),
})

const refresh = (id?: string) => {
  revalidatePath('/app/work/meetings')
  if (id) revalidatePath(`/app/work/meetings/${id}`)
}

const organizer = (ctx: { user: { name: string; email: string } }) => ({ name: ctx.user.name, email: ctx.user.email })

const when = (startAt: Date) => `${formatDate(startAt, { short: true })}, ${formatTime(startAt)}`

export const createMeeting = action(
  meetingSchema,
  async (input, ctx) => {
    const times = meetingTimes(input.date, input.start, input.end)
    if ('error' in times) return fail('Some fields need attention.', { [times.field]: times.error })
    if (times.startAt.getTime() < Date.now() - 5 * 60_000) return fail('Some fields need attention.', { start: 'Pick a time in the future' })
    await assertActiveMembers(ctx, input.attendeeIds, "One or more attendees aren't in this workspace")
    const organizerId = String(ctx.memberId)
    const meeting = await ctx.db(Meeting).create({
      title: input.title,
      agenda: input.agenda,
      ...times,
      organizerId,
      location: input.location,
      link: input.link,
      attendees: mergeAttendees([], input.attendeeIds, organizerId),
      status: 'scheduled',
      actionItems: [],
    })
    // The Google copy first, so the invite email carries the Meet link it creates.
    const google = await syncMeetingToGoogle(ctx, meeting._id)
    const invite = { _id: meeting._id, title: meeting.title, agenda: meeting.agenda, location: meeting.location, link: meeting.link || google.meetLink || undefined, startAt: meeting.startAt, endAt: meeting.endAt }
    await notifyMembers(ctx, input.attendeeIds, { title: `${ctx.user.name} invited you to '${meeting.title}', ${when(times.startAt)}`, href: `/app/work/meetings/${meeting._id}`, kind: 'info', product: 'work', event: 'meeting.scheduled', email: meetingEmail(invite, organizer(ctx)) })
    refresh()
    const note = google.synced ? (google.meetLink ? ' with a Google Meet link' : ' and added to Google Calendar') : ''
    return ok(`Meeting '${meeting.title}' scheduled${note}`, { id: String(meeting._id) }, `/app/work/meetings/${meeting._id}`)
  },
  { ...W, perm: 'meetings.write' },
)

export const updateMeeting = action(
  meetingSchema.extend({ id: objectId }),
  async (input, ctx) => {
    const meeting = await loadMeeting(ctx, input.id)
    assertCanEdit(ctx, meeting)
    if (meeting.status === 'cancelled') return fail('This meeting was cancelled. Schedule a new one instead.')
    const times = meetingTimes(input.date, input.start, input.end)
    if ('error' in times) return fail('Some fields need attention.', { [times.field]: times.error })
    await assertActiveMembers(ctx, input.attendeeIds, "One or more attendees aren't in this workspace")
    const existing = meeting.attendees.map((a) => ({ memberId: String(a.memberId), rsvp: a.rsvp, respondedAt: a.respondedAt }))
    const timeChanged = times.startAt.getTime() !== new Date(meeting.startAt).getTime() || times.endAt.getTime() !== new Date(meeting.endAt).getTime()
    const attendees = mergeAttendees(existing, input.attendeeIds, String(meeting.organizerId), timeChanged)
    await ctx.db(Meeting).updateOne({ _id: meeting._id }, { $set: { title: input.title, agenda: input.agenda ?? '', ...times, location: input.location ?? '', link: input.link ?? '', attendees } })
    const added = attendees.filter((a) => !existing.some((e) => e.memberId === a.memberId)).map((a) => a.memberId)
    const google = await syncMeetingToGoogle(ctx, meeting._id)
    const href = `/app/work/meetings/${meeting._id}`
    const invite = { _id: meeting._id, title: input.title, agenda: input.agenda, location: input.location, link: input.link || google.meetLink || undefined, ...times }
    if (timeChanged) await notifyMembers(ctx, attendees.map((a) => a.memberId).filter((id) => !added.includes(id)), { title: `'${input.title}' moved to ${when(times.startAt)}`, href, kind: 'info', product: 'work', event: 'meeting.updated', email: meetingEmail(invite, organizer(ctx)) })
    if (added.length) await notifyMembers(ctx, added, { title: `${ctx.user.name} invited you to '${input.title}', ${when(times.startAt)}`, href, kind: 'info', product: 'work', event: 'meeting.scheduled', email: meetingEmail(invite, organizer(ctx)) })
    const removed = existing.map((e) => e.memberId).filter((id) => !attendees.some((a) => a.memberId === id))
    if (removed.length) await notifyMembers(ctx, removed, { title: `${ctx.user.name} removed you from '${input.title}'`, href: '/app/work/meetings', kind: 'info', product: 'work', event: 'meeting.updated', email: meetingEmail(invite, organizer(ctx), 'CANCEL') })
    refresh(input.id)
    return ok(`Meeting '${input.title}' updated`)
  },
  W,
)

export const cancelMeeting = action(
  z.object({ id: objectId }),
  async ({ id }, ctx) => {
    const meeting = await loadMeeting(ctx, id)
    assertCanEdit(ctx, meeting)
    if (meeting.status === 'cancelled') return fail('This meeting is already cancelled.')
    await ctx.db(Meeting).updateOne({ _id: meeting._id }, { $set: { status: 'cancelled', cancelledAt: new Date(), cancelledById: ctx.memberId } })
    await cancelGoogleEvent(ctx, meeting._id)
    await notifyMembers(ctx, meeting.attendees.map((a) => a.memberId), { title: `'${meeting.title}' on ${when(meeting.startAt)} was cancelled`, href: `/app/work/meetings/${id}`, kind: 'warning', product: 'work', event: 'meeting.cancelled', email: meetingEmail(meeting, organizer(ctx), 'CANCEL') })
    await audit(ctx, { action: 'meeting.cancelled', entity: 'Meeting', entityId: meeting._id, summary: `Cancelled meeting ${meeting.title}`, product: 'work' })
    refresh(id)
    return ok(`Meeting '${meeting.title}' cancelled`)
  },
  W,
)

export const rsvpMeeting = action(
  z.object({ id: objectId, rsvp: z.enum(['accepted', 'tentative', 'declined']) }),
  async ({ id, rsvp }, ctx) => {
    const meeting = await loadMeeting(ctx, id)
    if (!meeting.attendees.some((a) => String(a.memberId) === String(ctx.memberId))) return fail("You're not invited to this meeting.")
    if (meeting.status === 'cancelled') return fail('This meeting was cancelled.')
    await ctx.db(Meeting).updateOne({ _id: meeting._id, 'attendees.memberId': ctx.memberId }, { $set: { 'attendees.$.rsvp': rsvp, 'attendees.$.respondedAt': new Date() } })
    if (String(meeting.organizerId) !== String(ctx.memberId) && rsvp === 'declined') {
      await notifyMembers(ctx, [meeting.organizerId], { title: `${ctx.user.name} declined '${meeting.title}'`, href: `/app/work/meetings/${id}`, kind: 'info', product: 'work', event: 'meeting.rsvp' })
    }
    refresh(id)
    return ok(rsvp === 'accepted' ? "You're going" : rsvp === 'tentative' ? 'Marked as maybe' : 'You declined')
  },
  W,
)

export const saveMeetingNotes = action(
  z.object({ id: objectId, notes: z.string().max(20000, 'Notes are too long').default('') }),
  async ({ id, notes }, ctx) => {
    const meeting = await loadMeeting(ctx, id)
    assertParticipant(ctx, meeting)
    await ctx.db(Meeting).updateOne({ _id: meeting._id }, { $set: { notes, notesUpdatedAt: new Date(), notesUpdatedById: ctx.memberId } })
    revalidatePath(`/app/work/meetings/${id}`)
    return ok()
  },
  W,
)
