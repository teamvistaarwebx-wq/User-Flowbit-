import 'server-only'
import type { Types } from 'mongoose'
import type { Ctx } from '@/lib/ctx'
import { todayIST } from '@/lib/dates'
import { fileUrl } from '@/lib/files'
import { Milestone } from '@/models/work/Milestone'
import { Task } from '@/models/work/Task'
import { TaskActivity } from '@/models/work/TaskActivity'

type Id = Types.ObjectId

export type MilestoneRow = { id: string; title: string; description: string | null; dueDate: string; status: 'open' | 'done'; linked: number; done: number; progress: number; overdue: boolean }

/** Milestones by due date with linked-task progress. */
export async function projectMilestones(ctx: Ctx, projectId: Id): Promise<MilestoneRow[]> {
  const [milestones, linked] = await Promise.all([
    ctx.db(Milestone).find({ projectId }).sort({ dueDate: 1, order: 1 }).lean(),
    ctx.db(Task).aggregate<{ _id: Id; total: number; done: number }>([
      { $match: { projectId, milestoneId: { $ne: null } } },
      { $group: { _id: '$milestoneId', total: { $sum: 1 }, done: { $sum: { $cond: [{ $eq: ['$status', 'done'] }, 1, 0] } } } },
    ]),
  ])
  const today = todayIST()
  return milestones.map((m) => {
    const counts = linked.find((l) => String(l._id) === String(m._id))
    const total = counts?.total ?? 0
    const done = counts?.done ?? 0
    return {
      id: String(m._id),
      title: m.title,
      description: m.description ?? null,
      dueDate: m.dueDate,
      status: m.status === 'done' ? 'done' : 'open',
      linked: total,
      done,
      progress: total ? Math.round((done / total) * 100) : m.status === 'done' ? 100 : 0,
      overdue: m.status !== 'done' && m.dueDate < today,
    }
  })
}

export const ACTIVITY_PAGE_SIZE = 30

/** Project feed: project rows plus task events in this project, newest first. */
export async function projectActivity(ctx: Ctx, projectId: Id, page: number) {
  const filter = { projectId }
  const [rows, total] = await Promise.all([
    ctx.db(TaskActivity).find(filter).sort({ createdAt: -1 }).skip((page - 1) * ACTIVITY_PAGE_SIZE).limit(ACTIVITY_PAGE_SIZE).lean(),
    ctx.db(TaskActivity).countDocuments(filter),
  ])
  const taskIds = [...new Set(rows.map((r) => r.taskId).filter(Boolean).map(String))]
  const tasks = taskIds.length ? await ctx.db(Task).find({ _id: { $in: taskIds } }, { key: 1, title: 1 }).lean() : []
  return { rows, total, tasks: new Map(tasks.map((t) => [String(t._id), { key: t.key, title: t.title }])) }
}

export type FileRow = { id: string; name: string; size: number | null; url: string; downloadUrl: string | null; uploadedById: string; uploadedAt: string | null; taskId?: string; taskKey?: string; isLink?: boolean }

/** Project uploads plus a read-only roll-up of attachments on the project's tasks. */
export async function projectFiles(ctx: Ctx, project: { _id: Id; files?: { _id: Id; fileId: Id; name: string; size?: number | null; uploadedById: Id; uploadedAt?: Date | null }[] | null }) {
  const uploads: FileRow[] = (project.files ?? []).map((f) => ({
    id: String(f._id),
    name: f.name,
    size: f.size ?? null,
    url: fileUrl(f.fileId),
    downloadUrl: fileUrl(f.fileId, { download: true }),
    uploadedById: String(f.uploadedById),
    uploadedAt: f.uploadedAt ? new Date(f.uploadedAt).toISOString() : null,
  }))
  const tasks = await ctx.db(Task).find({ projectId: project._id, isPersonal: { $ne: true }, 'attachments._id': { $exists: true } }, { key: 1, attachments: 1 }).limit(100).lean()
  const taskFiles: FileRow[] = tasks
    .flatMap((t) =>
      (t.attachments ?? []).map((a) => ({
        id: String(a._id),
        name: a.title,
        size: a.size ?? null,
        url: a.kind === 'link' ? (a.url ?? '#') : fileUrl(a.fileId),
        downloadUrl: a.kind === 'file' ? fileUrl(a.fileId, { download: true }) : null,
        uploadedById: String(a.uploadedById),
        uploadedAt: a.uploadedAt ? new Date(a.uploadedAt).toISOString() : null,
        taskId: String(t._id),
        taskKey: t.key,
        isLink: a.kind === 'link',
      })),
    )
    .sort((a, b) => (b.uploadedAt ?? '').localeCompare(a.uploadedAt ?? ''))
  return { uploads, taskFiles }
}

/** Open/done counts per assignee (every assignee counts) for the Overview workload. */
export async function projectWorkload(ctx: Ctx, projectId: Id) {
  return ctx.db(Task).aggregate<{ _id: Id; total: number; completed: number; inProgress: number }>([
    { $match: { projectId, parentId: null, isPersonal: { $ne: true } } },
    { $unwind: '$assigneeIds' },
    {
      $group: {
        _id: '$assigneeIds',
        total: { $sum: 1 },
        completed: { $sum: { $cond: [{ $eq: ['$status', 'done'] }, 1, 0] } },
        inProgress: { $sum: { $cond: [{ $in: ['$status', ['in_progress', 'in_review']] }, 1, 0] } },
      },
    },
    { $sort: { total: -1 } },
  ])
}
