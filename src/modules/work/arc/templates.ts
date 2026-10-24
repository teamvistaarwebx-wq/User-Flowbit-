import { addDays, formatDuration } from '@/lib/dates'
import type { BreakdownDraft, OutlineDraft } from './schemas'

type Phase = { title: string; days: number; tasks: string[] }

const WEBSITE: Phase[] = [
  { title: 'Discovery', days: 7, tasks: ['Kick-off call and goals', 'Audit the current site and analytics', 'Sitemap and content inventory'] },
  { title: 'Design', days: 14, tasks: ['Wireframes for key pages', 'Visual design and style guide', 'Client review and sign-off'] },
  { title: 'Build', days: 21, tasks: ['Set up project and environments', 'Build page templates', 'Content entry and integrations'] },
  { title: 'QA', days: 7, tasks: ['Cross-browser and mobile testing', 'Performance and SEO checks', 'Fix review comments'] },
  { title: 'Launch', days: 4, tasks: ['Go-live checklist and DNS', 'Launch and monitor', 'Handover and training'] },
]
const MARKETING: Phase[] = [
  { title: 'Brief', days: 5, tasks: ['Agree goals, audience and budget', 'Competitor and channel research', 'Sign off the brief'] },
  { title: 'Creative', days: 10, tasks: ['Key message and concepts', 'Copy for each channel', 'Design assets'] },
  { title: 'Production', days: 10, tasks: ['Final assets and approvals', 'Set up campaigns and tracking', 'Schedule posts and emails'] },
  { title: 'Launch', days: 5, tasks: ['Go live across channels', 'Daily checks and tweaks', 'Respond to comments and leads'] },
  { title: 'Report', days: 5, tasks: ['Collect results', 'Write the performance report', 'Share learnings with the client'] },
]
const DEFAULT: Phase[] = [
  { title: 'Plan', days: 5, tasks: ['Define scope and success criteria', 'Break work into tasks and owners', 'Agree the timeline'] },
  { title: 'Do', days: 14, tasks: ['Deliver the first batch of work', 'Mid-way check-in', 'Deliver the remaining work'] },
  { title: 'Review', days: 5, tasks: ['Internal review', 'Stakeholder review', 'Make the changes'] },
  { title: 'Close', days: 3, tasks: ['Final delivery', 'Retrospective', 'Archive files and notes'] },
]

const pick = (text: string): Phase[] => {
  const t = text.toLowerCase()
  if (/\b(website|site|web|app|portal|landing|shopify|ecommerce|e-commerce)\b/.test(t)) return WEBSITE
  if (/\b(marketing|campaign|launch ad|ads|social|seo|brand|content)\b/.test(t)) return MARKETING
  return DEFAULT
}

/** Keyword template: phases with 3 tasks each and cumulative due offsets. */
export function outlineTemplate(name: string, goal: string): OutlineDraft {
  let offset = 0
  return {
    milestones: pick(`${name} ${goal}`).map((p, i) => {
      offset += p.days
      return { title: p.title, dueOffsetDays: offset, tasks: p.tasks.map((title, j) => ({ title, estimateMinutes: j === 1 ? 240 : 120, priority: i === 0 && j === 0 ? 'high' : 'medium' })) }
    }),
  }
}

/** Due date of each milestone from the start date. */
export const milestoneDates = (startDate: string, draft: OutlineDraft) => draft.milestones.map((m) => addDays(startDate, m.dueOffsetDays))

/** Subtasks from the description's lines or sentences, else Research / Draft / Review / Finalise. */
export function breakdownTemplate(title: string, description?: string | null): BreakdownDraft {
  const lines = (description ?? '')
    .split(/\n|(?<=[.!?])\s+/)
    .map((l) => l.replace(/^[-*•\d.)\s]+/, '').trim())
    .filter((l) => l.length >= 4 && l.length <= 160)
  const steps = lines.length >= 3 ? lines.slice(0, 7) : [`Research: ${title}`, `Draft: ${title}`, `Review: ${title}`, `Finalise: ${title}`]
  return { subtasks: steps.map((s) => ({ title: s.slice(0, 200), estimateMinutes: 60 })) }
}

export type ProgressData = {
  periodLabel: string
  scopeLabel: string
  completed: { project: string; titles: string[] }[]
  created: number
  overdue: { title: string; days: number }[]
  blocked: { title: string; reason?: string }[]
  loggedByProject: { project: string; minutes: number }[]
  upcoming: { title: string; dueDate: string }[]
  meetings: number
}

const list = (items: string[], max = 5) => (items.length > max ? `${items.slice(0, max).join(', ')} and ${items.length - max} more` : items.join(', '))

/** Plain progress summary built only from the numbers passed in. */
export function progressText(d: ProgressData): string {
  const done = d.completed.reduce((s, g) => s + g.titles.length, 0)
  const logged = d.loggedByProject.reduce((s, p) => s + p.minutes, 0)
  const lines = [
    `${d.periodLabel}, ${d.scopeLabel} closed ${done} ${done === 1 ? 'task' : 'tasks'} across ${d.completed.length} ${d.completed.length === 1 ? 'project' : 'projects'} and opened ${d.created} new ${d.created === 1 ? 'one' : 'ones'}.`,
  ]
  if (d.completed.length) lines.push('', 'Done:', ...d.completed.map((g) => `• ${g.project}: ${list(g.titles)}`))
  if (logged) lines.push('', `Time logged: ${formatDuration(logged)} (${d.loggedByProject.map((p) => `${p.project} ${formatDuration(p.minutes)}`).join(', ')}).`)
  if (d.overdue.length) lines.push('', `Overdue (${d.overdue.length}): ${list(d.overdue.map((o) => `${o.title} (${o.days}d)`))}.`)
  if (d.blocked.length) lines.push('', `Blocked (${d.blocked.length}): ${list(d.blocked.map((b) => (b.reason ? `${b.title}: ${b.reason}` : b.title)))}.`)
  if (d.upcoming.length) lines.push('', `Due in the next 7 days: ${list(d.upcoming.map((u) => u.title))}.`)
  if (d.meetings) lines.push('', `${d.meetings} ${d.meetings === 1 ? 'meeting was' : 'meetings were'} held.`)
  if (!done && !d.created && !logged && !d.overdue.length) lines.push('', 'No tracked activity in this period yet.')
  return lines.join('\n')
}

/** Quick-answer shortcuts: queries like "overdue" jump to filtered Tasks. */
export function taskShortcut(q: string): { label: string; href: string } | null {
  const t = q.trim().toLowerCase()
  if (/^overdue\b/.test(t)) return { label: 'Open overdue tasks', href: '/app/work/tasks?due=overdue' }
  if (/^blocked\b/.test(t)) return { label: 'Open blocked tasks', href: '/app/work/tasks?status=blocked' }
  if (/^due today\b/.test(t)) return { label: 'Open tasks due today', href: '/app/work/tasks?due=today' }
  if (/^(due )?this week\b/.test(t)) return { label: 'Open tasks due this week', href: '/app/work/tasks?due=week' }
  return null
}
