/** Task enums, labels and presets. Pure and client-safe (models import these too). */

export const TASK_STATUSES = ['todo', 'in_progress', 'in_review', 'blocked', 'done'] as const
export type TaskStatus = (typeof TASK_STATUSES)[number]

export const TASK_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const
export type TaskPriority = (typeof TASK_PRIORITIES)[number]

export const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: 'To do',
  in_progress: 'In progress',
  in_review: 'In review',
  blocked: 'Blocked',
  done: 'Done',
}

export const PRIORITY_LABEL: Record<TaskPriority, string> = { low: 'Low', medium: 'Medium', high: 'High', urgent: 'Urgent' }

/** Sort rank: urgent first. */
export const PRIORITY_RANK: Record<TaskPriority, number> = { urgent: 0, high: 1, medium: 2, low: 3 }

export const OPEN_STATUSES: TaskStatus[] = ['todo', 'in_progress', 'in_review', 'blocked']
export const ACTIVE_STATUSES: TaskStatus[] = ['in_progress', 'in_review']

export const isTaskStatus = (v: unknown): v is TaskStatus => typeof v === 'string' && (TASK_STATUSES as readonly string[]).includes(v)
export const isTaskPriority = (v: unknown): v is TaskPriority => typeof v === 'string' && (TASK_PRIORITIES as readonly string[]).includes(v)

/** One working day for estimates: 1 day = 8 h (lib/attendance-core, the one default workday), 1 week = 5 days. */
export { WORKDAY_MINUTES } from '@/lib/attendance-core'
import { WORKDAY_MINUTES } from '@/lib/attendance-core'

export const ESTIMATE_PRESETS: { label: string; minutes: number }[] = [
  { label: '15 min', minutes: 15 },
  { label: '30 min', minutes: 30 },
  { label: '1 h', minutes: 60 },
  { label: '2 h', minutes: 120 },
  { label: '4 h', minutes: 240 },
  { label: '8 h', minutes: 480 },
  { label: '1 day', minutes: WORKDAY_MINUTES },
  { label: '2 days', minutes: 2 * WORKDAY_MINUTES },
  { label: '3 days', minutes: 3 * WORKDAY_MINUTES },
  { label: '1 week', minutes: 5 * WORKDAY_MINUTES },
  { label: '2 weeks', minutes: 10 * WORKDAY_MINUTES },
]

/** Due/start date quick picks, in days from today (IST). */
export const DATE_PRESETS: { label: string; days: number }[] = [
  { label: 'Today', days: 0 },
  { label: 'Tomorrow', days: 1 },
  { label: 'Next week', days: 7 },
  { label: '2 weeks', days: 14 },
  { label: '4 weeks', days: 28 },
  { label: '8 weeks', days: 56 },
]

export const TITLE_MIN = 3
export const TITLE_MAX = 200
export const TAG_MAX = 50
export const COMMENT_MAX = 5000
export const DESCRIPTION_MAX = 10000

export const COMMENT_REACTIONS = ['👍', '❤️', '😊', '🎉', '👏', '🔥', '✅', '👀'] as const

/** Suggested next steps on the task detail page. */
export const NEXT_STEPS: Record<TaskStatus, { label: string; to: TaskStatus }[]> = {
  todo: [{ label: 'Start progress', to: 'in_progress' }],
  in_progress: [
    { label: 'Send for review', to: 'in_review' },
    { label: 'Mark done', to: 'done' },
  ],
  in_review: [{ label: 'Mark done', to: 'done' }],
  blocked: [{ label: 'Unblock', to: 'in_progress' }],
  done: [{ label: 'Reopen', to: 'todo' }],
}

/** Attachment types accepted on tasks and projects (no SVG: it can carry script). */
export const ATTACHMENT_TYPES = [
  'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf', 'text/csv', 'text/plain',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/zip', 'application/x-zip-compressed', 'application/vnd.rar', 'application/x-rar-compressed',
]
export const ATTACHMENT_ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.jpg,.jpeg,.png,.gif,.webp,.zip,.rar'
