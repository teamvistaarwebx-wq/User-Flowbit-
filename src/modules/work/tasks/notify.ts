import 'server-only'
import type { Ctx } from '@/lib/ctx'
import { notifyMembers } from '@/lib/notify'
import { STATUS_LABEL, type TaskStatus } from './constants'

type Id = unknown
type NotifyTask = { _id: Id; title: string; creatorId?: Id; assigneeIds?: Id[] | null; watcherIds?: Id[] | null }

const href = (task: NotifyTask, hash = '') => `/app/work/tasks/${String(task._id)}${hash}`
const unique = (ids: Id[]) => [...new Set(ids.filter((id) => id != null).map(String))]
const stakeholders = (task: NotifyTask) => unique([task.creatorId, ...(task.assigneeIds ?? []), ...(task.watcherIds ?? [])])

/** "{actor} assigned you 'Homepage copy'" to newly added assignees. */
export async function notifyAssigned(ctx: Ctx, task: NotifyTask, memberIds: Id[]): Promise<void> {
  await notifyMembers(ctx, unique(memberIds), {
    title: `${ctx.user.name} assigned you '${task.title}'`,
    href: href(task),
    kind: 'assignment',
    product: 'work',
    event: 'task.assigned',
    action: { kind: 'task', id: String(task._id) },
  })
}

/** "Task 'Homepage copy' moved to Done" to creator, assignees and watchers. */
export async function notifyStatus(ctx: Ctx, task: NotifyTask, to: TaskStatus): Promise<void> {
  await notifyMembers(ctx, stakeholders(task), {
    title: `Task '${task.title}' moved to ${STATUS_LABEL[to]}`,
    href: href(task),
    kind: to === 'done' ? 'success' : 'info',
    product: 'work',
    event: 'task.status_changed',
  })
}

/** Blocked: stakeholders and the project lead; people mentioned in the reason get a mention. */
export async function notifyBlocked(ctx: Ctx, task: NotifyTask, reason: string, extra: { projectLeadId?: Id; mentionIds?: Id[] } = {}): Promise<void> {
  const mentioned = unique(extra.mentionIds ?? [])
  const others = unique([...stakeholders(task), extra.projectLeadId]).filter((id) => !mentioned.includes(id))
  await notifyMembers(ctx, others, { title: `'${task.title}' is blocked: ${reason}`, href: href(task), kind: 'warning', product: 'work', event: 'task.blocked' })
  await notifyMembers(ctx, mentioned, { title: `${ctx.user.name} mentioned you on '${task.title}'`, body: reason.slice(0, 100), href: href(task), kind: 'mention', product: 'work', event: 'task.mentioned' })
}

export async function notifyUnblocked(ctx: Ctx, task: NotifyTask): Promise<void> {
  await notifyMembers(ctx, stakeholders(task), { title: `'${task.title}' is unblocked`, href: href(task), kind: 'info', product: 'work', event: 'task.unblocked' })
}

/** Mentions get "{actor} mentioned you", other watchers get "{actor} commented". */
export async function notifyComment(ctx: Ctx, task: NotifyTask, comment: { _id: Id; body: string; mentionIds: Id[] }): Promise<void> {
  const mentioned = unique(comment.mentionIds)
  const hash = `#comment-${String(comment._id)}`
  await notifyMembers(ctx, mentioned, { title: `${ctx.user.name} mentioned you on '${task.title}'`, body: comment.body.slice(0, 100), href: href(task, hash), kind: 'mention', product: 'work', event: 'task.mentioned' })
  const watchers = stakeholders(task).filter((id) => !mentioned.includes(id))
  await notifyMembers(ctx, watchers, { title: `${ctx.user.name} commented on '${task.title}'`, body: comment.body.slice(0, 100), href: href(task, hash), kind: 'info', product: 'work', event: 'task.commented' })
}

/** "You lead the project 'Website revamp'". */
export async function notifyProjectLead(ctx: Ctx, project: { _id: Id; name: string; leadId: Id }): Promise<void> {
  await notifyMembers(ctx, [String(project.leadId)], {
    title: `You lead the project '${project.name}'`,
    href: `/app/work/projects/${String(project._id)}`,
    kind: 'assignment',
    product: 'work',
    event: 'project.lead_assigned',
  })
}
