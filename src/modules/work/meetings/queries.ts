import 'server-only'
import type { Ctx } from '@/lib/ctx'
import { addDays, istInstant } from '@/lib/dates'
import { escapeRegex } from '@/lib/utils'
import { Meeting } from '@/models/work/Meeting'
import { Task } from '@/models/work/Task'
import { peopleMap, type PeopleMap } from '../teams/people'
import { isOrganizer, meetingScope } from './access'
import type { MongoFilter } from '../reports/mongo-filter'

export const MEETING_FILTERS = ['upcoming', 'past', 'all'] as const
export type MeetingFilter = (typeof MEETING_FILTERS)[number]
export const MEETINGS_PAGE_SIZE = 20

export type MeetingCardData = {
  id: string
  title: string
  startAt: string
  endAt: string
  status: string
  organizer: string
  organizerId: string
  isOrganizer: boolean
  link?: string
  location?: string
  attendees: { id: string; name: string; rsvp: string }[]
  myRsvp?: string
}

type Lean = Awaited<ReturnType<typeof findMeetings>>[number]
const findMeetings = (ctx: Ctx, filter: MongoFilter, sort: Record<string, 1 | -1>, skip = 0, limit = 200) =>
  ctx.db(Meeting).find({ ...filter, ...meetingScope(ctx) }).sort(sort).skip(skip).limit(limit).lean()

function toCard(ctx: Ctx, m: Lean, people: PeopleMap): MeetingCardData {
  const me = String(ctx.memberId)
  return {
    id: String(m._id),
    title: m.title,
    startAt: m.startAt.toISOString(),
    endAt: m.endAt.toISOString(),
    status: m.status,
    organizer: people.get(String(m.organizerId))?.name ?? 'Former member',
    organizerId: String(m.organizerId),
    isOrganizer: isOrganizer(ctx, m),
    link: m.link || undefined,
    location: m.location || undefined,
    attendees: m.attendees.map((a) => ({ id: String(a.memberId), name: people.get(String(a.memberId))?.name ?? 'Former member', rsvp: a.rsvp })),
    myRsvp: m.attendees.find((a) => String(a.memberId) === me)?.rsvp,
  }
}

async function cards(ctx: Ctx, rows: Lean[]) {
  const people = await peopleMap(ctx, rows.flatMap((m) => [m.organizerId, ...m.attendees.map((a) => a.memberId)]))
  return rows.map((m) => toCard(ctx, m, people))
}

/** List view: upcoming (by end time) / past / all, optional "organised by me" and search. */
export async function listMeetings(ctx: Ctx, opts: { filter: MeetingFilter; mine: boolean; q: string; page: number }) {
  const now = new Date()
  const narrow: MongoFilter = {
    ...(opts.mine ? { organizerId: ctx.memberId } : {}),
    ...(opts.q ? { $and: [{ $or: [{ title: new RegExp(escapeRegex(opts.q), 'i') }, { agenda: new RegExp(escapeRegex(opts.q), 'i') }] }] } : {}),
  }
  const filter: MongoFilter = {
    ...(opts.filter === 'upcoming' ? { endAt: { $gte: now } } : opts.filter === 'past' ? { endAt: { $lt: now } } : {}),
    ...narrow,
  }
  const sort: Record<string, 1 | -1> = opts.filter === 'upcoming' ? { startAt: 1 } : { startAt: -1 }
  const [rows, total, upcoming] = await Promise.all([
    findMeetings(ctx, filter, sort, (opts.page - 1) * MEETINGS_PAGE_SIZE, MEETINGS_PAGE_SIZE),
    ctx.db(Meeting).countDocuments({ ...filter, ...meetingScope(ctx) }),
    // The Upcoming pill counts what the Upcoming list shows (same mine/search filters, cancelled included).
    ctx.db(Meeting).countDocuments({ ...narrow, endAt: { $gte: now }, ...meetingScope(ctx) }),
  ])
  return { meetings: await cards(ctx, rows), total, upcoming }
}

/** Calendar view: every meeting in the 7 days from `weekStart` (IST). */
export async function weekMeetings(ctx: Ctx, weekStart: string, mine: boolean) {
  const rows = await findMeetings(ctx, { startAt: { $gte: istInstant(weekStart), $lt: istInstant(addDays(weekStart, 7)) }, ...(mine ? { organizerId: ctx.memberId } : {}) }, { startAt: 1 })
  return cards(ctx, rows)
}

export async function meetingDetail(ctx: Ctx, id: string) {
  const m = await ctx.db(Meeting).findOne({ _id: id, ...meetingScope(ctx) }).lean()
  if (!m) return null
  const people = await peopleMap(ctx, [m.organizerId, ...m.attendees.map((a) => a.memberId), ...m.actionItems.flatMap((i) => (i.assigneeId ? [i.assigneeId] : [])), ...(m.notesUpdatedById ? [m.notesUpdatedById] : [])])
  const taskIds = m.actionItems.flatMap((i) => (i.taskId ? [i.taskId] : []))
  const tasks = taskIds.length ? await ctx.db(Task).find({ _id: { $in: taskIds } }, { key: 1, title: 1, status: 1 }).lean() : []
  const me = String(ctx.memberId)
  return {
    ...toCard(ctx, m, people),
    agenda: m.agenda ?? '',
    notes: m.notes ?? '',
    google: m.google?.eventId ? { synced: !m.google.error, error: m.google.error ?? undefined } : m.google?.error ? { synced: false, error: m.google.error } : undefined,
    notesUpdated: m.notesUpdatedAt ? { at: m.notesUpdatedAt.toISOString(), by: people.get(String(m.notesUpdatedById))?.name ?? 'Someone' } : undefined,
    isParticipant: String(m.organizerId) === me || m.attendees.some((a) => String(a.memberId) === me) || ctx.can('tasks.manage'),
    actionItems: m.actionItems.map((i) => {
      const task = i.taskId ? tasks.find((t) => String(t._id) === String(i.taskId)) : undefined
      return {
        id: String(i._id),
        title: i.title,
        assignee: i.assigneeId ? (people.get(String(i.assigneeId))?.name ?? 'Former member') : undefined,
        dueDate: i.dueDate ?? undefined,
        done: i.done,
        task: task ? { id: String(task._id), key: task.key, status: task.status } : undefined,
      }
    }),
  }
}
