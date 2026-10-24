import 'server-only'
import { requireMember } from '@/lib/ctx'
import { fileUrl } from '@/lib/files'
import { plain } from '@/lib/serialize'
import { canAccessProject } from '@/modules/work/projects/access'
import { imagesView } from '@/modules/work/images'
import { canAccessTask } from '@/modules/work/tasks/access'
import { taskDetail } from '@/modules/work/tasks/detail'
import { findTask } from '@/modules/work/tasks/load'
import { taskData } from '@/modules/work/tasks/options'
import { peopleIndex } from '@/modules/work/tasks/people'
import { loadRelationFlags, taskRelations } from '@/modules/work/tasks/relations'
import { getViewer } from '@/modules/work/tasks/viewer'
import type { ActivityItem } from './activity-panel'
import type { CommentRow } from './comment-item'

/**
 * Everything the task page and the task side panel show, loaded once so both render the same
 * data through the same components. `missing` / `denied` let each caller answer its own way.
 */
export async function loadTaskView(id: string) {
  const ctx = await requireMember({ product: 'work', perm: 'tasks.read' })
  const viewer = await getViewer(ctx)
  const task = await findTask(ctx, id)
  if (!task) return { kind: 'missing' as const }
  if (!canAccessTask(viewer, task)) return { kind: 'denied' as const }
  const [detail, data, relations, flags] = await Promise.all([taskDetail(ctx, viewer, task), taskData(ctx, viewer), taskRelations(ctx, viewer, task), loadRelationFlags(ctx, [task])])
  const people = peopleIndex(data.people)
  const row = { ...detail.row, flags: flags.get(String(task._id)) ?? detail.row.flags }
  const priorityIds = [...new Set([String(task.creatorId), ...row.assigneeIds, ...(detail.project ? [String(detail.project.leadId), ...(detail.project.memberIds ?? []).map(String)] : [])])]
  const comments: CommentRow[] = detail.comments.map((c) => ({
    id: String(c._id), authorId: String(c.authorId), body: c.body, parentId: c.parentId ? String(c.parentId) : null,
    mentionIds: (c.mentionIds ?? []).map(String), reactions: (c.reactions ?? []).map((r) => ({ emoji: r.emoji, memberId: String(r.memberId) })),
    editedAt: c.editedAt ? new Date(c.editedAt).toISOString() : null, createdAt: new Date(c.createdAt).toISOString(), images: imagesView(c.images),
  }))
  const activity: ActivityItem[] = detail.activity.map((a) => plain({ id: String(a._id), actorId: String(a.actorId), type: a.type, from: a.from, to: a.to, meta: (a.meta ?? null) as Record<string, unknown> | null, createdAt: new Date(a.createdAt).toISOString() }) as ActivityItem)
  return {
    kind: 'ok' as const,
    task,
    detail,
    data,
    row,
    relations,
    comments,
    activity,
    priorityIds,
    checklist: (task.checklist ?? []).map((c) => ({ id: String(c._id), title: c.title, done: Boolean(c.done) })),
    creatorName: people.name(task.creatorId),
    watchers: people.many(task.watcherIds).map((p) => ({ name: p.name, src: p.avatarUrl })),
    canLogTime: ctx.can('time.write'),
    projectLinkable: detail.project ? canAccessProject(viewer.memberId, ctx.can('projects.write'), detail.project) : false,
    clientLogoUrl: detail.client?.logoFileId ? fileUrl(detail.client.logoFileId) : null,
    /** Client portal controls (feature 'portal'), for a task with a client or a project that someone may edit. */
    portal:
      ctx.hasFeature('portal') && row.canEdit && (task.clientId || task.projectId)
        ? { visible: Boolean(task.clientVisible), approval: task.approval ? { status: task.approval.status, comment: task.approval.comment ?? null, decidedByName: task.approval.decidedByName ?? null } : null }
        : null,
  }
}

export type TaskView = Extract<Awaited<ReturnType<typeof loadTaskView>>, { kind: 'ok' }>
