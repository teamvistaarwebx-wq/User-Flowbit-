import { formatDate, formatDuration } from '@/lib/dates'
import { PRIORITY_LABEL, STATUS_LABEL, type TaskPriority, type TaskStatus } from './constants'

/** Task and project activity types (TaskActivity.type). */
export const ACTIVITY_TYPES = [
  'created', 'title_changed', 'description_updated', 'status_changed', 'priority_changed', 'assignees_changed',
  'start_date_changed', 'due_date_changed', 'estimate_changed', 'tags_changed', 'project_changed', 'space_changed',
  'milestone_changed', 'client_changed', 'blocked', 'unblocked', 'comment_added', 'subtask_added', 'subtask_completed', 'subtask_reopened',
  'checklist_added', 'checklist_item_done', 'checklist_item_reopened', 'checklist_renamed', 'checklist_removed', 'attachment_added', 'attachment_deleted',
  'watcher_added', 'shared', 'completed', 'deleted', 'relation_added', 'relation_removed', 'blocker_done',
  // project-level rows (taskId empty)
  'project_created', 'project_updated', 'project_status_changed', 'project_lead_changed', 'project_member_added',
  'project_member_removed', 'project_archived', 'project_restored', 'milestone_added', 'milestone_done', 'milestone_reopened',
  'milestone_deleted', 'file_added', 'file_deleted',
  // client portal (modules/portal): the agency's controls and the client's answers
  'approval_requested', 'client_approved', 'client_changes_requested', 'client_visibility_changed', 'portal_shared',
] as const
export type ActivityType = (typeof ACTIVITY_TYPES)[number]

export type ActivityRow = { type: ActivityType | string; from?: unknown; to?: unknown; meta?: Record<string, unknown> | null }

/** Relation kinds as read after "marked this task …". */
const RELATION_WORDS: Record<string, string> = { blocked_by: 'blocked by', blocks: 'as blocking', related: 'related to' }

const status = (v: unknown) => STATUS_LABEL[v as TaskStatus] ?? String(v ?? '—')
const priority = (v: unknown) => PRIORITY_LABEL[v as TaskPriority] ?? String(v ?? '—')
const day = (v: unknown) => (v ? formatDate(String(v)) : 'None')
const ids = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : [])
const text = (v: unknown) => (v == null || v === '' ? '' : String(v))

function assigneeText(row: ActivityRow, nameOf: (id: string) => string): string {
  const before = ids(row.from)
  const after = ids(row.to)
  const added = after.filter((id) => !before.includes(id)).map(nameOf)
  const removed = before.filter((id) => !after.includes(id)).map(nameOf)
  const parts = [added.length ? `assigned ${added.join(', ')}` : '', removed.length ? `removed ${removed.join(', ')}` : ''].filter(Boolean)
  return parts.join(' and ') || 'changed the assignees'
}

/** Who did it: the client's contact for portal answers (meta.portalContact), else the member. */
export function activityActor(row: ActivityRow & { actorId?: string | null }, nameOf: (id: string) => string): string {
  const contact = row.meta?.portalContact
  return typeof contact === 'string' && contact ? `${contact} (client)` : nameOf(String(row.actorId ?? ''))
}

/** What happened, after the actor's name: `changed status from "In progress" to "Done"`. */
export function describeActivity(row: ActivityRow, nameOf: (id: string) => string = (id) => id): string {
  const m = row.meta ?? {}
  switch (row.type) {
    case 'created': return m.source ? `created this task from ${text(m.source)}${m.via ? ` via ${text(m.via)}` : ''}` : 'created this task'
    case 'title_changed': return `renamed the task to "${text(row.to)}"`
    case 'description_updated': return 'updated the description'
    case 'status_changed': return `changed status from "${status(row.from)}" to "${status(row.to)}"`
    case 'priority_changed': return `changed priority from "${priority(row.from)}" to "${priority(row.to)}"`
    case 'assignees_changed': return assigneeText(row, nameOf)
    case 'start_date_changed': return `changed start date from ${day(row.from)} to ${day(row.to)}`
    case 'due_date_changed': return `changed due date from ${day(row.from)} to ${day(row.to)}`
    case 'estimate_changed': return `changed the estimate from ${row.from ? formatDuration(Number(row.from)) : 'None'} to ${row.to ? formatDuration(Number(row.to)) : 'None'}`
    case 'tags_changed': return ids(row.to).length ? `set tags to ${ids(row.to).join(', ')}` : 'cleared the tags'
    case 'project_changed': return m.name ? `moved this task to project ${text(m.name)}` : 'removed this task from its project'
    case 'space_changed': return m.name ? `moved this task to ${text(m.name)}` : 'moved this task out of its space'
    case 'milestone_changed': return m.name ? `linked this task to milestone ${text(m.name)}` : 'unlinked the milestone'
    case 'client_changed': return m.name ? `set the client to ${text(m.name)}` : 'removed the client'
    case 'blocked': return `marked this task as blocked: ${text(row.to)}`
    case 'unblocked': return 'unblocked this task'
    case 'comment_added': return 'added a comment'
    case 'subtask_added': return `added subtask "${text(m.title)}"`
    case 'subtask_completed': return `completed subtask "${text(m.title)}"`
    case 'subtask_reopened': return `reopened subtask "${text(m.title)}"`
    case 'checklist_added': return `added checklist item "${text(m.title)}"`
    case 'checklist_item_done': return `checked off "${text(m.title)}"`
    case 'checklist_item_reopened': return `unchecked "${text(m.title)}"`
    case 'checklist_renamed': return `renamed checklist item "${text(row.from)}" to "${text(row.to)}"`
    case 'checklist_removed': return `removed checklist item "${text(m.title)}"`
    case 'attachment_added': return `added an attachment: ${text(m.name)}`
    case 'attachment_deleted': return `removed an attachment: ${text(m.name)}`
    case 'watcher_added': return 'started watching this task'
    case 'shared': return 'changed who this task is shared with'
    case 'relation_added': return `marked this task ${RELATION_WORDS[text(m.kind)] ?? 'related to'} ${text(m.key)} · ${text(m.title)}`
    case 'relation_removed': return `removed the link (${RELATION_WORDS[text(m.kind)] ?? 'related to'}) to ${text(m.key)} · ${text(m.title)}`
    case 'blocker_done': return `finished ${text(m.key)} · ${text(m.title)}, which was blocking this task`
    case 'completed': return `completed task "${text(m.title)}"`
    case 'deleted': return `deleted task "${text(m.title)}"`
    case 'approval_requested': return `asked the client to approve this${m.note ? `: "${text(m.note)}"` : ''}`
    case 'client_approved': return `approved this in the client portal${m.comment ? `: "${text(m.comment)}"` : ''}`
    case 'client_changes_requested': return `asked for changes in the client portal: "${text(m.comment)}"`
    case 'client_visibility_changed': return row.to ? 'made this task visible to the client' : 'hid this task from the client'
    case 'portal_shared': return row.to ? 'shared the project in the client portal' : 'stopped sharing the project in the client portal'
    case 'project_created': return 'created the project'
    case 'project_updated': return ids(m.fields).length ? `updated ${ids(m.fields).join(', ')}` : 'updated the project'
    case 'project_status_changed': return `changed project status from "${text(row.from).replace('_', ' ')}" to "${text(row.to).replace('_', ' ')}"`
    case 'project_lead_changed': return `made ${nameOf(text(row.to))} the project lead`
    case 'project_member_added': return `added ${ids(row.to).map(nameOf).join(', ')} to the project`
    case 'project_member_removed': return `removed ${ids(row.from).map(nameOf).join(', ')} from the project`
    case 'project_archived': return 'archived the project'
    case 'project_restored': return 'restored the project'
    case 'milestone_added': return `added milestone "${text(m.title)}"`
    case 'milestone_done': return `completed milestone "${text(m.title)}"`
    case 'milestone_reopened': return `reopened milestone "${text(m.title)}"`
    case 'milestone_deleted': return `deleted milestone "${text(m.title)}"`
    case 'file_added': return `uploaded ${text(m.name)}`
    case 'file_deleted': return `deleted ${text(m.name)}`
    default: return 'made a change'
  }
}
