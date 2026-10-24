import { rupees } from '../pricing'
import { PLAN_PRICES } from '@/lib/plans'
import type { ProductContent } from './types'

export const WORK_CONTENT: ProductContent = {
  key: 'work',
  eyebrow: 'Tasks and projects',
  oneLiner: 'Tasks, projects and the week, in one place.',
  sub: 'Plan in spaces and projects, move work across a board, run meetings that end in tasks, and log time without rebuilding your week from memory.',
  heroMock: 'work-board',
  features: [
    { icon: 'SquareCheckBig', title: 'Tasks, three ways', body: 'List, Board and Calendar. Drag cards between To do, In progress, In review, Blocked and Done, or see tasks by due date.', points: ['Filter by assignee, project, space, priority, status and due', 'Saved views, bulk actions and quick add', 'Every task gets a key like FB-42'] },
    { icon: 'ClipboardList', title: 'A task page with everything on it', body: 'Description, subtasks, checklist, comments with @mentions, attachments, watchers, time logged and a full activity timeline.' },
    { icon: 'LayoutGrid', title: 'Spaces and folders', body: 'Organise work the way your teams actually run, with colours, icons and members for every space.' },
    { icon: 'FolderKanban', title: 'Projects with honest health', body: 'Progress ring, milestones, members, files and activity. Health comes from the tasks themselves: overdue and blocked work pulls it down.' },
    { icon: 'UsersRound', title: 'Teams and workload', body: 'See who is on which team and how much open work each person carries before you assign more.' },
    { icon: 'CalendarDays', title: 'Meetings that end in tasks', body: 'Schedule with attendees, agenda and a link. Take notes, turn action items into tasks and collect RSVPs.' },
    { icon: 'Megaphone', title: 'Posts', body: 'Announcements with categories, pinning, read receipts, replies and reactions, so the update everyone needs is not lost in chat.' },
    { icon: 'Timer', title: 'Time tracking', body: 'A timer or manual entries against tasks and projects, a weekly timesheet, submit the week, manager approval.' },
    { icon: 'PenTool', title: 'Whiteboards', body: 'Sketch flows and plan sprints on boards saved with your workspace.' },
    { icon: 'ChartColumn', title: 'Reports', body: 'Throughput, overdue work, work by assignee, project health and time by project, for any date range, exported to CSV.' },
  ],
  spotlights: [
    {
      label: 'Project overview',
      icon: 'FolderKanban',
      title: 'Health you can trust, because nobody types it in',
      body: 'A project page pulls its numbers from the work inside it. Done, in progress and blocked are counted from tasks, and overdue work drags health down on its own.',
      points: ['Concentric progress ring: done, in progress, blocked', 'Milestones with dates and owners', 'Members, files and a full activity trail'],
      mock: 'work-project',
    },
    {
      label: 'Weekly timesheet',
      icon: 'Timer',
      title: 'Log time as you go, submit the week on Friday',
      body: 'Start a timer from any task or add entries by hand. The week adds itself up by project, you submit it, and your manager approves it in one place.',
      points: ['Timer and manual entries against tasks and projects', 'Submit the week; managers approve or send back', 'Time by project in Reports'],
      mock: 'work-timesheet',
    },
  ],
  steps: [
    { title: 'Create your workspace', body: 'Name it, pick project-based or personal, and invite the team by email.' },
    { title: 'Set up spaces or projects', body: 'Mirror how your teams run: a space per team, a project per client engagement.' },
    { title: 'Assign and move tasks', body: 'Everyone sees what is theirs on Home and in Assigned to me.' },
    { title: 'Log time and run meetings', body: 'Action items become tasks; timers become timesheets.' },
    { title: 'Check Reports on Friday', body: 'Throughput, overdue work and time by project, ready to export.' },
  ],
  worksWith: [
    { title: 'One client list', body: 'Projects link to the same client record that Orbit sells to and Folio invoices.', href: '/products/orbit', product: 'orbit' },
    { title: 'Check-in feeds attendance', body: 'The check-in widget in the sidebar writes straight into the Muster attendance register.', href: '/products/muster', product: 'muster' },
    { title: 'Arc drafts, you apply', body: 'Arc outlines projects, breaks down big tasks and writes your weekly update from real activity.', href: '/#arc', product: 'core' },
  ],
  notYet: ['Gantt charts', 'Native mobile apps (Flowbit works in your phone’s browser)', 'Guest accounts (clients use the client portal instead)'],
  plans: ['work'],
  pricingNote: 'Everyone who signs in counts as a user. There are no guest accounts.',
  seo: {
    title: 'Flowbit Work: tasks, projects, meetings and time tracking',
    description: `List, board and calendar views, projects with derived health, meetings that end in tasks, weekly timesheets and reports. ${rupees(PLAN_PRICES.work.monthlyPaise)} per user a month.`,
  },
}
