/**
 * Event groups: the rows of the notification grid (notifications-v2 §5) and
 * the defaults from §3 (Team and People tables). Every `notify()` event key
 * ('task.assigned', 'leave.requested', ...) belongs to exactly one group.
 * Pure: shared by the server (fan-out) and the settings screens.
 */

export const CHANNELS = ['inapp', 'email', 'whatsapp'] as const
export type Channel = (typeof CHANNELS)[number]
export type ChannelSet = Readonly<Record<Channel, boolean>>

/** How alert emails of a group go out: one per event, or batched into the hourly digest. */
export type EmailMode = 'instant' | 'hourly'

export type EventGroup = Readonly<{
  key: string
  label: string
  description: string
  /** Exact event keys, or 'area.*' for every event of an area. */
  events: readonly string[]
  defaults: ChannelSet
  emailMode: EmailMode
  /** Urgent groups skip quiet hours, digests and snooze. */
  urgent?: boolean
  /** Channels fixed by Flowbit (not editable): security mails always go and never by a workspace's WhatsApp. */
  fixed?: Partial<ChannelSet>
  /**
   * Channels only the person can switch on for themselves (marketing-category
   * WhatsApp such as birthday wishes needs their own opt-in): the workspace
   * default can never turn them on.
   */
  optInOnly?: Partial<Record<Channel, true>>
}>

const on = (email: boolean, whatsapp = false): ChannelSet => ({ inapp: true, email, whatsapp })

export const EVENT_GROUPS: readonly EventGroup[] = [
  { key: 'task_assigned', label: 'Tasks assigned to me', description: 'Someone gives you a task or a project to lead.', events: ['task.assigned', 'project.lead_assigned'], defaults: on(true), emailMode: 'instant' },
  { key: 'mentions', label: '@mentions', description: 'Someone mentions you on a task or a post.', events: ['task.mentioned', 'post.mention'], defaults: on(true), emailMode: 'instant' },
  { key: 'task_blocked', label: 'Blocked tasks', description: 'A task you work on is blocked or unblocked.', events: ['task.blocked', 'task.unblocked'], defaults: on(true), emailMode: 'instant' },
  { key: 'task_due', label: 'Due today and overdue', description: 'Your tasks due today, and overdue ones every 3 days.', events: ['task.due_today', 'task.overdue'], defaults: on(true), emailMode: 'instant' },
  { key: 'comments', label: 'Comments and replies', description: 'New comments on your tasks and replies to your posts. Emailed as an hourly digest.', events: ['task.commented', 'post.reply'], defaults: on(true), emailMode: 'hourly' },
  { key: 'task_updates', label: 'Task status changes', description: 'A task you follow moves to another status.', events: ['task.status_changed'], defaults: on(false), emailMode: 'instant' },
  { key: 'client_portal', label: 'Client portal', description: 'A client approves a deliverable or asks for changes in the client portal.', events: ['portal.*'], defaults: on(true), emailMode: 'instant' },
  {
    key: 'approvals',
    label: 'Approvals waiting on me',
    description: 'Leave, timesheets, claims, attendance corrections, comp-offs and bank changes to review.',
    events: ['leave.requested', 'leave.withdrawn', 'timesheet.submitted', 'claim.submitted', 'attendance.correction_requested', 'attendance.compoff_requested', 'employee.bank_changed', 'employee.change_requested', 'payroll.submitted', 'payroll.approved'],
    defaults: on(true),
    emailMode: 'instant',
  },
  {
    key: 'decisions',
    label: 'Decisions on my requests',
    description: 'Your leave, timesheet, claim, correction or comp-off was approved or not, or your leave was cancelled.',
    events: ['leave.approved', 'leave.rejected', 'leave.cancelled', 'timesheet.approved', 'timesheet.rejected', 'claim.decided', 'attendance.correction_approved', 'attendance.correction_rejected', 'attendance.compoff_approved', 'attendance.compoff_rejected'],
    defaults: on(true),
    emailMode: 'instant',
  },
  { key: 'people_reminders', label: 'HR reminders', description: 'Probation ending, documents expiring, new joiners and joining checklists.', events: ['people.*'], defaults: on(true), emailMode: 'instant' },
  { key: 'attendance_nudges', label: 'Attendance nudges', description: 'Not checked in yet, or forgot to check out.', events: ['attendance.nudge'], defaults: on(false), emailMode: 'instant' },
  {
    key: 'greetings',
    label: 'Birthdays and anniversaries',
    description: 'Wishes to you and posts about colleagues. WhatsApp only if you turn it on yourself: Meta counts greetings as marketing.',
    events: ['greetings.*'],
    defaults: on(true),
    emailMode: 'instant',
    optInOnly: { whatsapp: true },
  },
  { key: 'compliance', label: 'Compliance dates', description: 'GST, TDS, PF, ESI, professional tax and advance tax reminders from the compliance calendar.', events: ['compliance.*'], defaults: on(true), emailMode: 'instant' },
  { key: 'meetings', label: 'Meetings', description: 'Invites, changes and cancellations. Emails carry a calendar (.ics) file.', events: ['meeting.*'], defaults: on(true), emailMode: 'instant' },
  { key: 'followups', label: 'Follow-ups due', description: 'Orbit and Folio follow-ups due today or assigned to you.', events: ['orbit.followup_due', 'orbit.followup_assigned', 'folio.followup_assigned'], defaults: on(true), emailMode: 'instant' },
  { key: 'sales', label: 'Leads and deals', description: 'Leads and deals assigned to you, won or lost.', events: ['orbit.*'], defaults: on(false), emailMode: 'instant' },
  { key: 'money', label: 'Invoices and payments', description: 'Drafts ready, payments received, overdue invoices, bounced receipts.', events: ['folio.*', 'invoice.*'], defaults: on(false), emailMode: 'instant' },
  {
    key: 'payslips',
    label: 'Payslips and letters',
    description: 'Your payslip or a letter is ready. Payslip contents go by email only; WhatsApp can only say a payslip is ready, never an amount.',
    events: ['payroll.payslip_published', 'letter.issued'],
    defaults: on(false),
    emailMode: 'instant',
  },
  { key: 'team', label: 'Team and announcements', description: 'Announcements, teams, projects, whiteboards and workspace members.', events: ['post.*', 'team.*', 'project.*', 'whiteboard.*', 'member.*', 'employee.*', 'payroll.*', 'timesheet.*'], defaults: on(false), emailMode: 'instant' },
  { key: 'account', label: 'Flowbit account', description: 'Trial, plan and payment notices for this workspace.', events: ['subscription.*', 'platform.*'], defaults: on(false), emailMode: 'instant', fixed: { whatsapp: false } },
  {
    key: 'security',
    label: 'Security',
    description: 'Password resets, sign-in codes and ownership changes. Always emailed.',
    events: ['security.*'],
    defaults: on(true),
    emailMode: 'instant',
    urgent: true,
    fixed: { email: true, whatsapp: false },
  },
]

/** Events that match no group fall here: in-app only. */
export const OTHER_GROUP: EventGroup = { key: 'other', label: 'Everything else', description: 'Other updates.', events: [], defaults: on(false), emailMode: 'instant' }

const BY_KEY = new Map(EVENT_GROUPS.map((g) => [g.key, g]))

export const groupByKey = (key: string): EventGroup => BY_KEY.get(key) ?? OTHER_GROUP
export const isGroupKey = (key: string): boolean => BY_KEY.has(key)

/**
 * The group an event belongs to. Exact keys win over 'area.*' wildcards, so
 * 'orbit.followup_due' is a follow-up while other orbit events are sales.
 */
export function groupForEvent(event: string | null | undefined): EventGroup {
  if (!event) return OTHER_GROUP
  const exact = EVENT_GROUPS.find((g) => g.events.includes(event))
  if (exact) return exact
  const area = `${event.split('.')[0]}.*`
  return EVENT_GROUPS.find((g) => g.events.includes(area)) ?? OTHER_GROUP
}
