import 'server-only'
import type { Types } from 'mongoose'
import type { Ctx } from '@/lib/ctx'
import { appUrl } from '@/lib/env'
import { Meeting } from '@/models/work/Meeting'
import { cancelEvent, insertEvent, listEvents, patchEvent } from '@/modules/google/client'
import { accessTokenFor, connectionInfo, googleIntegrationsReady } from '@/modules/google/connections'
import { conferenceRequestId, eventBody, meetLinkOf, toExternalEvents, type ExternalEvent } from '@/modules/google/event-body'
import { listPeople } from '../teams/people'

/**
 * Keeps a Flowbit meeting's copy on the organiser's Google Calendar: created
 * with a Meet link, updated on edit, cancelled on cancel. A Google failure
 * never fails the meeting itself; it is stored on the meeting and logged.
 */

type SyncCtx = Pick<Ctx, 'db' | 'memberId'>
type MeetingDoc = { _id: Types.ObjectId; title: string; agenda?: string | null; startAt: Date; endAt: Date; timezone?: string | null; location?: string | null; link?: string | null; organizerId: Types.ObjectId | string; attendees: { memberId: Types.ObjectId | string }[]; google?: { eventId?: string | null; memberId?: Types.ObjectId | null; meetLink?: string | null } | null }

export type SyncResult = Readonly<{ synced: boolean; meetLink: string | null }>
const NOT_SYNCED: SyncResult = { synced: false, meetLink: null }

const errorText = (error: unknown) => (error instanceof Error ? error.message : 'Google Calendar did not respond').slice(0, 300)

async function attendeeEmails(ctx: SyncCtx, meeting: MeetingDoc): Promise<string[]> {
  const ids = meeting.attendees.map((a) => String(a.memberId)).filter((id) => id !== String(meeting.organizerId))
  if (!ids.length) return []
  return (await listPeople(ctx, ids)).map((p) => p.email).filter(Boolean)
}

/** Creates or updates the Google event for this meeting, when the calendar owner has Google Calendar connected. */
export async function syncMeetingToGoogle(ctx: SyncCtx, meetingId: Types.ObjectId | string): Promise<SyncResult> {
  const meeting = (await ctx.db(Meeting).findOne({ _id: meetingId }).lean()) as MeetingDoc | null
  if (!meeting) return NOT_SYNCED
  const ownerId = meeting.google?.memberId ?? meeting.organizerId
  try {
    const token = await accessTokenFor(ctx, ownerId, 'calendar')
    if (!token) return NOT_SYNCED
    const eventId = meeting.google?.eventId
    // Ask Google for a Meet only when the meeting has no video link of its own and no Meet yet.
    const withMeet = !meeting.google?.meetLink && !meeting.link
    const body = eventBody(
      { id: String(meeting._id), title: meeting.title, agenda: meeting.agenda, startAt: meeting.startAt, endAt: meeting.endAt, timezone: meeting.timezone, location: meeting.location, link: meeting.link || meeting.google?.meetLink, attendeeEmails: await attendeeEmails(ctx, meeting), url: appUrl(`/app/work/meetings/${meeting._id}`) },
      { withMeet, requestId: conferenceRequestId(String(meeting._id)) },
    )
    const event = eventId ? await patchEvent(token, eventId, body) : await insertEvent(token, body)
    const meetLink = meetLinkOf(event) ?? meeting.google?.meetLink ?? null
    await ctx.db(Meeting).updateOne(
      { _id: meeting._id },
      { $set: { 'google.eventId': event.id ?? eventId, 'google.memberId': ownerId, 'google.meetLink': meetLink ?? undefined, 'google.syncedAt': new Date(), ...(meetLink && !meeting.link ? { link: meetLink } : {}) }, $unset: { 'google.error': 1 } },
    )
    return { synced: true, meetLink }
  } catch (error) {
    console.error('[google] meeting sync failed', String(meeting._id), errorText(error))
    await ctx.db(Meeting).updateOne({ _id: meeting._id }, { $set: { 'google.error': errorText(error) } })
    return NOT_SYNCED
  }
}

/**
 * Whether saving the meeting form will create a Google Meet link: the calendar
 * owner's (the organiser's) connection, for the hint in the form. 'off' when
 * Google is not set up on this server.
 */
export type MeetingCalendar = Readonly<{ status: 'off' | 'connected' | 'not_connected' | 'broken'; mine: boolean; ownerName: string }>

export async function meetingCalendarFor(ctx: SyncCtx, ownerId: Types.ObjectId | string, ownerName: string): Promise<MeetingCalendar> {
  const mine = String(ownerId) === String(ctx.memberId)
  if (!googleIntegrationsReady()) return { status: 'off', mine, ownerName }
  const info = await connectionInfo(ctx, ownerId, 'calendar')
  return { status: info.broken ? 'broken' : info.connected ? 'connected' : 'not_connected', mine, ownerName }
}

/** Cancels the Google copy of a cancelled meeting. */
export async function cancelGoogleEvent(ctx: SyncCtx, meetingId: Types.ObjectId | string): Promise<boolean> {
  const meeting = (await ctx.db(Meeting).findOne({ _id: meetingId }, { google: 1, organizerId: 1 }).lean()) as Pick<MeetingDoc, '_id' | 'google' | 'organizerId'> | null
  const eventId = meeting?.google?.eventId
  if (!meeting || !eventId) return false
  try {
    const token = await accessTokenFor(ctx, meeting.google?.memberId ?? meeting.organizerId, 'calendar')
    if (!token) return false
    await cancelEvent(token, eventId)
    await ctx.db(Meeting).updateOne({ _id: meeting._id }, { $set: { 'google.syncedAt': new Date() }, $unset: { 'google.error': 1 } })
    return true
  } catch (error) {
    console.error('[google] meeting cancel failed', String(meeting._id), errorText(error))
    await ctx.db(Meeting).updateOne({ _id: meeting._id }, { $set: { 'google.error': errorText(error) } })
    return false
  }
}

/**
 * The viewer's own upcoming Google events in [from, to), read-only, without
 * the ones Flowbit created. Empty when not connected or Google fails.
 */
export async function externalEvents(ctx: SyncCtx, from: Date, to: Date): Promise<ExternalEvent[]> {
  try {
    const token = await accessTokenFor(ctx, ctx.memberId, 'calendar')
    if (!token) return []
    const events = await listEvents(token, from, to)
    const ids = events.flatMap((e) => (e.id ? [e.id] : []))
    const ours = ids.length ? await ctx.db(Meeting).distinct('google.eventId', { 'google.eventId': { $in: ids } }) : []
    return toExternalEvents(events, new Set(ours.map(String)))
  } catch (error) {
    console.error('[google] calendar import failed', errorText(error))
    return []
  }
}
