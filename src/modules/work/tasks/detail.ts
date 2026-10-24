import 'server-only'
import mongoose from 'mongoose'
import type { Ctx } from '@/lib/ctx'
import { fileUrl } from '@/lib/files'
import { Client } from '@/models/Client'
import { Folder } from '@/models/work/Folder'
import { Milestone } from '@/models/work/Milestone'
import { Project } from '@/models/work/Project'
import { Space } from '@/models/work/Space'
import { Task } from '@/models/work/Task'
import { TaskActivity } from '@/models/work/TaskActivity'
import { TaskComment } from '@/models/work/TaskComment'
import { canModifyTask, canShareTask, type Viewer } from './access'
import type { TaskDoc } from './load'
import { subtaskCounts, toTaskRow } from './queries'

const ACTIVITY_LIMIT = 100
const TIME_LIMIT = 50

export type TimeEntryRow = { id: string; memberId: string; date: string; minutes: number; note: string; status: string; isRunning: boolean }

/** Time entries come from work-b's time tracking collection; empty when it doesn't exist yet. */
async function timeEntriesFor(ctx: Ctx, taskId: unknown): Promise<TimeEntryRow[]> {
  const col = mongoose.connection.db?.collection('timeentries')
  if (!col) return []
  try {
    const rows = await col.find({ orgId: ctx.orgId, taskId }).sort({ date: -1, createdAt: -1 }).limit(TIME_LIMIT).toArray()
    return rows.map((r) => ({
      id: String(r._id),
      memberId: String(r.memberId ?? ''),
      date: String(r.date ?? ''),
      minutes: Number(r.minutes ?? 0),
      note: String(r.note ?? ''),
      status: String(r.status ?? 'draft'),
      isRunning: Boolean(r.isRunning),
    }))
  } catch (error) {
    console.error('[work] could not read time entries', error)
    return []
  }
}

/** Everything the task detail page shows, in one place. */
export async function taskDetail(ctx: Ctx, viewer: Viewer, task: TaskDoc) {
  const [children, comments, activity, project, space, folder, client, milestone, parent, time] = await Promise.all([
    ctx.db(Task).find({ parentId: task._id }, { description: 0, attachments: 0 }).sort({ createdAt: 1 }).lean(),
    ctx.db(TaskComment).find({ taskId: task._id }).sort({ createdAt: 1 }).lean(),
    ctx.db(TaskActivity).find({ taskId: task._id }).sort({ createdAt: -1 }).limit(ACTIVITY_LIMIT).lean(),
    task.projectId ? ctx.db(Project).findById(task.projectId, { name: 1, code: 1, color: 1, leadId: 1, memberIds: 1, createdById: 1 }).lean() : null,
    task.spaceId ? ctx.db(Space).findById(task.spaceId, { name: 1, color: 1 }).lean() : null,
    task.folderId ? ctx.db(Folder).findById(task.folderId, { name: 1 }).lean() : null,
    task.clientId ? ctx.db(Client).findById(task.clientId, { name: 1, kind: 1, logoFileId: 1 }).lean() : null,
    task.milestoneId ? ctx.db(Milestone).findById(task.milestoneId, { title: 1 }).lean() : null,
    task.parentId ? ctx.db(Task).findById(task.parentId, { key: 1, title: 1 }).lean() : null,
    timeEntriesFor(ctx, task._id),
  ])
  const counts = await subtaskCounts(ctx, [task._id])
  const milestones = task.projectId ? await ctx.db(Milestone).find({ projectId: task.projectId, status: 'open' }, { title: 1, dueDate: 1 }).sort({ dueDate: 1 }).lean() : []
  return {
    row: toTaskRow(task, viewer, counts.get(String(task._id))),
    subtasks: children.map((c) => toTaskRow(c, viewer)),
    comments,
    activity,
    project,
    space,
    folder,
    client,
    milestone,
    milestones,
    parent,
    time,
    attachments: (task.attachments ?? []).map((a) => ({
      id: String(a._id),
      kind: a.kind,
      title: a.title,
      url: a.kind === 'link' ? (a.url ?? '#') : fileUrl(a.fileId),
      downloadUrl: a.kind === 'file' ? fileUrl(a.fileId, { download: true }) : undefined,
      mime: a.mime ?? undefined,
      size: a.size ?? undefined,
      uploadedById: String(a.uploadedById),
      uploadedAt: a.uploadedAt ? new Date(a.uploadedAt).toISOString() : undefined,
    })),
    canEdit: canModifyTask(viewer, task),
    canShare: canShareTask(viewer, task),
    watching: (task.watcherIds ?? []).some((w) => String(w) === viewer.memberId),
  }
}

export type TaskDetail = Awaited<ReturnType<typeof taskDetail>>
