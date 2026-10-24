/**
 * Work (part b) demo data: teams, meetings, posts, time and timesheets,
 * whiteboards. Called from modules/work/seed.ts (work-a) after tasks and
 * projects exist; reads them defensively. Models and pure helpers only.
 */
import type { Types } from 'mongoose'
import { addDays, istInstant } from '@/lib/dates'
import type { SeedCtx, SeedMember } from '@/lib/seed-types'
import { Meeting, type Rsvp } from '@/models/work/Meeting'
import { Post } from '@/models/work/Post'
import { PostReply } from '@/models/work/PostReply'
import { Project } from '@/models/work/Project'
import { Task } from '@/models/work/Task'
import { Team } from '@/models/work/Team'
import { TimeEntry, type TimeStatus } from '@/models/work/TimeEntry'
import { Timesheet } from '@/models/work/Timesheet'
import { Whiteboard } from '@/models/work/Whiteboard'
import { BOARD_BACKGROUND } from './whiteboards/scene'

const THIS_WEEK = '2026-09-28'
const RSVP_CYCLE: Rsvp[] = ['accepted', 'accepted', 'tentative', 'declined']
const LAST_WEEK = '2026-09-21'

export async function seed(ctx: SeedCtx): Promise<void> {
  const people = ctx.allMembers
  const m = ctx.members
  await seedTeams(ctx, people)
  await seedMeetings(ctx, people)
  await seedPosts(ctx, people)
  await seedTime(ctx, [m.member, m.manager, m.admin, m.sales, ...people.filter((p) => !Object.values(m).some((r) => String(r._id) === String(p._id))).slice(0, 3)])
  await seedWhiteboards(ctx)
}

const ids = (list: SeedMember[]) => list.map((p) => p._id)
const pickFrom = (list: SeedMember[], start: number, count: number) => Array.from({ length: Math.min(count, list.length) }, (_, i) => list[(start + i) % list.length])

async function seedTeams(ctx: SeedCtx, people: SeedMember[]) {
  const joinedAt = new Date('2026-06-01T04:30:00Z')
  const teams = [
    { name: 'Design', description: 'Brand, UI and motion for client work.', color: '#BB62A5', lead: ctx.members.manager, extra: pickFrom(people, 2, 4) },
    { name: 'Engineering', description: 'Websites, apps and integrations.', color: '#60A5FA', lead: ctx.members.admin, extra: pickFrom(people, 6, 5) },
    { name: 'Growth', description: 'Performance marketing, SEO and content.', color: '#5EEAB0', lead: ctx.members.sales, extra: pickFrom(people, 10, 4) },
  ]
  await ctx.db(Team).insertMany(
    teams.map((t) => {
      const memberIds = [...new Set([String(t.lead._id), ...t.extra.map((p) => String(p._id)), String(ctx.members.member._id)])]
      return { name: t.name, description: t.description, color: t.color, isActive: true, createdById: ctx.members.owner._id, members: memberIds.map((id) => ({ memberId: id, role: (id === String(t.lead._id) ? 'lead' : 'member') as 'lead' | 'member', addedById: ctx.members.owner._id, joinedAt })) }
    }),
  )
  ctx.log(`teams: ${teams.length}`)
}

async function seedMeetings(ctx: SeedCtx, people: SeedMember[]) {
  const tasks = await ctx.db(Task).find({}, { _id: 1, title: 1 }).limit(3).lean()
  const project = await ctx.db(Project).findOne({}, { _id: 1 }).lean()
  const m = ctx.members
  const at = (date: string, start: string, end: string) => ({ startAt: istInstant(date, start), endAt: istInstant(date, end) })
  const attendees = (organizer: SeedMember, list: SeedMember[], answered: boolean) =>
    [...new Map([organizer, ...list].map((p) => [String(p._id), p])).values()].map((p, i) => ({ memberId: p._id, rsvp: (String(p._id) === String(organizer._id) ? 'accepted' : answered ? RSVP_CYCLE[i % 4] : 'pending') as Rsvp, respondedAt: answered ? new Date('2026-09-25T06:00:00Z') : undefined }))
  const rows = [
    { title: 'Sprint review: Acme website', agenda: 'Demo the new homepage and pricing page.\nAgree what ships next sprint.', ...at('2026-09-25', '11:00', '12:00'), organizerId: m.manager._id, attendees: attendees(m.manager, [m.member, m.admin, ...pickFrom(people, 3, 3)], true), link: 'https://meet.google.com/abc-defg-hij', projectId: project?._id,
      notes: 'Homepage approved with copy changes. Pricing page needs the GST note.\nClient wants launch before Diwali (20 Oct).', notesUpdatedAt: new Date('2026-09-25T07:00:00Z'), notesUpdatedById: m.manager._id,
      actionItems: [
        { title: 'Add GST note to pricing page', assigneeId: m.member._id, dueDate: '2026-09-30', done: true, taskId: tasks[0]?._id },
        { title: 'Share launch checklist with client', assigneeId: m.manager._id, dueDate: '2026-10-03', done: false },
        { title: 'Book a QA slot with the client team', assigneeId: m.admin._id, dueDate: '2026-10-06', done: false },
      ] },
    { title: 'Weekly planning', agenda: 'Priorities for the week, blockers, leave.', ...at('2026-09-28', '10:30', '11:00'), organizerId: m.owner._id, attendees: attendees(m.owner, [m.manager, m.admin, m.sales, m.member], true), location: 'Board room', notes: 'Two people on leave Friday. Growth team to cover the Rao Foods report.', notesUpdatedAt: new Date('2026-09-28T05:40:00Z'), notesUpdatedById: m.owner._id, actionItems: [{ title: 'Send Rao Foods September report', assigneeId: m.sales._id, dueDate: '2026-10-02', done: false }] },
    { title: 'Design critique', agenda: 'Mobile navigation options and icon set.', ...at('2026-10-01', '15:00', '15:45'), organizerId: m.manager._id, attendees: attendees(m.manager, pickFrom(people, 2, 4), true), link: 'https://zoom.us/j/9876543210', actionItems: [] },
    { title: 'Client call: Sharma Textiles', agenda: 'Walk through the catalogue shoot plan and timelines.', ...at('2026-10-02', '12:00', '12:30'), organizerId: m.sales._id, attendees: attendees(m.sales, [m.manager, m.member], false), link: 'https://meet.google.com/xyz-abcd-efg', actionItems: [] },
    { title: 'Sprint review: Acme website', agenda: 'QA findings and go/no-go for launch.', ...at('2026-10-09', '11:00', '12:00'), organizerId: m.manager._id, attendees: attendees(m.manager, [m.member, m.admin, ...pickFrom(people, 3, 3)], false), link: 'https://meet.google.com/abc-defg-hij', projectId: project?._id, actionItems: [] },
    { title: 'Monthly all-hands', agenda: 'September numbers, new joiners, Diwali plans.', ...at('2026-10-06', '17:00', '18:00'), organizerId: m.owner._id, attendees: attendees(m.owner, people, false), location: 'Terrace', actionItems: [] },
    { title: 'Vendor demo: print partner', agenda: 'Pricing for brochure runs.', ...at('2026-10-05', '16:00', '16:30'), organizerId: m.admin._id, attendees: attendees(m.admin, [m.finance, m.manager], true), status: 'cancelled' as const, cancelledAt: new Date('2026-09-30T09:00:00Z'), cancelledById: m.admin._id, actionItems: [] },
  ]
  await ctx.db(Meeting).insertMany(rows.map((r) => ({ timezone: 'Asia/Kolkata', status: 'scheduled' as const, ...r })))
  ctx.log(`meetings: ${rows.length}`)
}

const reactions = (list: [string, SeedMember[]][]) => list.map(([emoji, who]) => ({ emoji, memberIds: ids(who) }))

async function seedPosts(ctx: SeedCtx, people: SeedMember[]) {
  const m = ctx.members
  const reads = (who: SeedMember[], when: string) => who.map((p, i) => ({ memberId: p._id, readAt: new Date(new Date(when).getTime() + i * 3_600_000) }))
  const rows = [
    { authorId: m.owner._id, title: 'Diwali holidays: office closed 20–22 Oct', message: 'The office will be closed from Tuesday 20 Oct to Thursday 22 Oct for Diwali. Please plan client deliveries around these dates and update your leave in Muster if you are taking extra days.\n\nWishing everyone a bright and safe festival!', category: 'announcement' as const, priority: 'high' as const, pinned: true, pinnedAt: new Date('2026-09-29T05:00:00Z'), pinnedById: m.owner._id, createdAt: new Date('2026-09-29T05:00:00Z'), reactions: reactions([['🎉', pickFrom(people, 0, 7)], ['❤️', pickFrom(people, 5, 3)]]), reads: reads(pickFrom(people, 0, 11), '2026-09-29T05:30:00Z') },
    { authorId: m.hr_admin._id, title: 'New attendance rules from 1 October', message: 'Check-in grace is now 15 minutes after 10:00. Three late marks in a month count as a half day. Questions? Reply here.', category: 'policy' as const, priority: 'medium' as const, acks: pickFrom(people, 1, 5).map((p) => ({ memberId: p._id, at: new Date('2026-09-30T06:00:00Z') })), createdAt: new Date('2026-09-30T04:00:00Z'), reactions: reactions([['👍', pickFrom(people, 2, 6)]]), reads: reads(pickFrom(people, 1, 8), '2026-09-30T05:00:00Z') },
    { authorId: m.manager._id, title: 'Should we move stand-ups to 10:15?', message: 'A few of us reach right at 10. Moving stand-up to 10:15 gives everyone time to settle in. Thoughts?', category: 'question' as const, createdAt: new Date('2026-09-27T06:00:00Z'), reactions: reactions([['👍', pickFrom(people, 3, 4)], ['😂', [m.member]]]), reads: reads(pickFrom(people, 2, 9), '2026-09-27T07:00:00Z') },
    { authorId: m.member._id, title: 'Idea: a shared library of proposal templates', message: 'We rewrite the same scope sections for every website proposal. A shared folder of approved sections (scope, timeline, terms) would save hours each week.', category: 'update' as const, createdAt: new Date('2026-09-24T09:30:00Z'), mentionIds: [m.manager._id], reactions: reactions([['🙌', pickFrom(people, 4, 5)]]), reads: reads(pickFrom(people, 3, 6), '2026-09-24T10:00:00Z') },
    { authorId: m.sales._id, title: 'Won: Rao Foods SEO retainer', message: 'Rao Foods signed a 6-month SEO retainer at ₹45,000 a month. Kick-off on 5 Oct. Thanks to the Growth team for the audit that closed it.', category: 'win' as const, createdAt: new Date('2026-09-26T11:00:00Z'), reactions: reactions([['🎉', pickFrom(people, 0, 9)], ['👏', pickFrom(people, 6, 4)]]), reads: reads(pickFrom(people, 0, 12), '2026-09-26T11:30:00Z') },
    { authorId: m.manager._id, title: 'Kudos for the Acme launch', message: 'Shipping the Acme site two days early took late nights and calm heads. Thank you!', category: 'kudos' as const, featuredIds: [m.member._id, m.admin._id], createdAt: new Date('2026-10-01T10:00:00Z'), reactions: reactions([['👏', pickFrom(people, 0, 6)]]), reads: reads(pickFrom(people, 0, 7), '2026-10-01T10:30:00Z') },
    { authorId: m.hr_admin._id, title: 'Team lunch: which day works?', message: 'Pick every day that works for you.', category: 'poll' as const, poll: { multiple: true, anonymous: false, options: [{ key: 'a', label: 'Thursday', voterIds: ids(pickFrom(people, 0, 4)) }, { key: 'b', label: 'Friday', voterIds: ids(pickFrom(people, 2, 5)) }, { key: 'c', label: 'Saturday', voterIds: [] }] }, createdAt: new Date('2026-10-02T06:00:00Z'), reads: reads(pickFrom(people, 0, 6), '2026-10-02T07:00:00Z') },
    { authorId: m.manager._id, title: 'Leads: timesheet reminder', message: 'Managers, please approve last week’s timesheets by Friday so billing can go out on Monday.', category: 'announcement' as const, priority: 'medium' as const, audience: 'roles' as const, targetRoles: ['manager', 'admin', 'owner'], createdAt: new Date('2026-09-30T08:00:00Z'), reads: reads([m.admin, m.owner], '2026-09-30T09:00:00Z') },
  ]
  const posts = await ctx.db(Post).insertMany(rows.map((r) => ({ audience: 'org' as const, targetRoles: [] as string[], mentionIds: [] as Types.ObjectId[], replyCount: 0, lastActivityAt: r.createdAt, ...r })))
  const replies = [
    { post: 2, author: m.admin, body: '10:15 works for me. Mondays could stay at 10 for planning.', at: '2026-09-27T07:10:00Z' },
    { post: 2, author: m.member, body: '+1 for 10:15.', at: '2026-09-27T08:00:00Z' },
    { post: 3, author: m.manager, body: 'Love this. Can you start with the website proposal sections? I will review.', at: '2026-09-24T11:00:00Z' },
    { post: 1, author: m.member, body: 'Does the grace period apply to client visits too?', at: '2026-09-30T06:00:00Z' },
    { post: 1, author: m.hr_admin, body: 'Client visits are marked On duty, so no late mark. Add a note when you check in.', at: '2026-09-30T06:30:00Z' },
    { post: 4, author: m.owner, body: 'Great work, team.', at: '2026-09-26T12:00:00Z' },
  ]
  await ctx.db(PostReply).insertMany(replies.map((r) => ({ postId: posts[r.post]._id, authorId: r.author._id, body: r.body, mentionIds: [], reactions: [], createdAt: new Date(r.at) })))
  for (const [i, post] of posts.entries()) {
    const mine = replies.filter((r) => r.post === i)
    if (mine.length) await ctx.db(Post).updateOne({ _id: post._id }, { $set: { replyCount: mine.length, lastActivityAt: new Date(mine[mine.length - 1].at) } })
  }
  ctx.log(`posts: ${posts.length}, replies: ${replies.length}`)
}

async function seedTime(ctx: SeedCtx, members: SeedMember[]) {
  const [tasks, projects] = await Promise.all([
    ctx.db(Task).find({ isPersonal: { $ne: true } }, { assigneeIds: 1, projectId: 1, clientId: 1 }).limit(60).lean(),
    ctx.db(Project).find({}, { clientId: 1 }).limit(10).lean(),
  ])
  if (!tasks.length && !projects.length) {
    ctx.log('time: skipped (no tasks or projects yet)')
    return
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const entries: Record<string, any>[] = []
  const logged = new Map<string, number>()
  const unique = [...new Map(members.map((p) => [String(p._id), p])).values()]
  for (const [mi, member] of unique.entries()) {
    const theirs = tasks.filter((t) => t.assigneeIds.some((a) => String(a) === String(member._id)))
    const pool: { taskId?: Types.ObjectId; projectId?: Types.ObjectId; billable: boolean }[] = theirs.length
      ? theirs.slice(0, 4).map((t) => ({ taskId: t._id, projectId: t.projectId ?? undefined, billable: Boolean(t.clientId) }))
      : projects.slice(0, 2).map((p) => ({ projectId: p._id, billable: Boolean(p.clientId) }))
    if (!pool.length) continue
    for (const weekStart of [LAST_WEEK, THIS_WEEK]) {
      const days = weekStart === THIS_WEEK ? 4 : 6
      for (let d = 0; d < days; d += 1) {
        const target = pool[(d + mi) % pool.length]
        const minutes = 120 + ((d * 37 + mi * 23) % 5) * 45
        const date = addDays(weekStart, d)
        entries.push({ memberId: member._id, ...target, date, weekStart, minutes, source: d % 3 === 0 ? 'timer' : 'manual', startedAt: d % 3 === 0 ? istInstant(date, '10:30') : undefined, endedAt: d % 3 === 0 ? new Date(istInstant(date, '10:30').getTime() + minutes * 60_000) : undefined, isRunning: false, note: d % 2 ? 'Review and fixes' : undefined, status: 'draft' })
        if (target.taskId) logged.set(String(target.taskId), (logged.get(String(target.taskId)) ?? 0) + minutes)
      }
    }
  }
  const lastWeekStatus = (i: number): TimeStatus => (i === 0 ? 'submitted' : i % 3 === 2 ? 'draft' : 'approved')
  const sheets = unique.flatMap((member, i) => {
    const mine = entries.filter((e) => String(e.memberId) === String(member._id))
    if (!mine.length) return []
    const total = (week: string, billableOnly = false) => mine.filter((e) => e.weekStart === week && (!billableOnly || e.billable)).reduce((s, e) => s + (e.minutes as number), 0)
    const status = lastWeekStatus(i)
    for (const e of mine) if (e.weekStart === LAST_WEEK) e.status = status
    return [
      { memberId: member._id, weekStart: LAST_WEEK, status, totalMinutes: total(LAST_WEEK), billableMinutes: total(LAST_WEEK, true), submittedAt: status === 'draft' ? undefined : new Date('2026-09-27T12:00:00Z'), decidedAt: status === 'approved' ? new Date('2026-09-29T06:00:00Z') : undefined, decidedById: status === 'approved' ? ctx.members.manager._id : undefined },
      { memberId: member._id, weekStart: THIS_WEEK, status: 'draft' as TimeStatus, totalMinutes: total(THIS_WEEK), billableMinutes: total(THIS_WEEK, true) },
    ]
  })
  await ctx.db(TimeEntry).insertMany(entries)
  await ctx.db(Timesheet).insertMany(sheets)
  for (const [taskId, minutes] of logged) await ctx.db(Task).updateOne({ _id: taskId }, { $inc: { loggedMinutes: minutes } })
  ctx.log(`time entries: ${entries.length}, timesheets: ${sheets.length}`)
}

const shape = (id: string, type: 'rectangle' | 'ellipse' | 'diamond', x: number, y: number, w: number, h: number, bg: string) => ({ id, type, x, y, width: w, height: h, angle: 0, strokeColor: '#EAC1DC', backgroundColor: bg, fillStyle: 'solid', strokeWidth: 2, strokeStyle: 'solid', roughness: 1, opacity: 100, roundness: { type: 3 }, seed: x * 7 + y, version: 1, versionNonce: x + y * 3, isDeleted: false, groupIds: [], frameId: null, boundElements: [], updated: 1759300000000, link: null, locked: false })
const text = (id: string, x: number, y: number, value: string) => ({ id, type: 'text', x, y, width: value.length * 11, height: 25, angle: 0, strokeColor: '#F4F1F8', backgroundColor: 'transparent', fillStyle: 'solid', strokeWidth: 1, strokeStyle: 'solid', roughness: 0, opacity: 100, roundness: null, seed: x + y, version: 1, versionNonce: x * 2 + y, isDeleted: false, groupIds: [], frameId: null, boundElements: [], updated: 1759300000000, link: null, locked: false, text: value, originalText: value, fontSize: 20, fontFamily: 5, textAlign: 'left', verticalAlign: 'top', containerId: null, autoResize: true, lineHeight: 1.25 })

async function seedWhiteboards(ctx: SeedCtx) {
  const appState = { viewBackgroundColor: BOARD_BACKGROUND, gridSize: null, theme: 'dark' }
  await ctx.db(Whiteboard).insertMany([
    {
      title: 'Acme website: user flow',
      ownerId: ctx.members.manager._id,
      sharedWith: [ctx.members.member._id, ctx.members.admin._id],
      scene: { elements: [shape('wb1-a', 'rectangle', 40, 60, 180, 80, '#4B2A8C'), text('wb1-at', 70, 88, 'Home'), shape('wb1-b', 'rectangle', 300, 60, 180, 80, '#4B2A8C'), text('wb1-bt', 330, 88, 'Pricing'), shape('wb1-c', 'diamond', 560, 40, 160, 120, '#BB62A5'), text('wb1-ct', 595, 88, 'Sign up?'), shape('wb1-d', 'ellipse', 820, 60, 180, 80, '#1E6B5C'), text('wb1-dt', 860, 88, 'Thank you')], appState, files: {} },
      version: 1,
      lastEditedById: ctx.members.manager._id,
    },
    {
      title: 'Q3 retro',
      ownerId: ctx.members.owner._id,
      sharedWith: [],
      scene: { elements: [text('wb2-a', 40, 40, 'Went well'), shape('wb2-b', 'rectangle', 40, 80, 220, 140, '#1E6B5C'), text('wb2-c', 320, 40, 'Could be better'), shape('wb2-d', 'rectangle', 320, 80, 220, 140, '#B4543A'), text('wb2-e', 600, 40, 'Try next'), shape('wb2-f', 'rectangle', 600, 80, 220, 140, '#4B2A8C')], appState, files: {} },
      version: 1,
      lastEditedById: ctx.members.owner._id,
    },
  ])
  ctx.log('whiteboards: 2')
}
