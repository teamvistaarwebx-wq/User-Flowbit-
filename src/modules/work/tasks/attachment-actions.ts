'use server'

import { z } from 'zod'
import { action, ok } from '@/lib/actions'
import { NotFoundError } from '@/lib/errors'
import { deleteStoredFile, saveUpload } from '@/lib/files'
import { objectId } from '@/lib/validation'
import { Task } from '@/models/work/Task'
import { logActivity } from './activity-log'
import { ATTACHMENT_TYPES } from './constants'
import { requireTask } from './load'
import { revalidateWork } from './revalidate'
import { getViewer } from './viewer'

const WORK = { product: 'work', perm: 'tasks.write' } as const

/** Upload a file to a task (MAX_UPLOAD_MB per file). */
export const uploadAttachment = action(
  z.object({ taskId: objectId, file: z.instanceof(File, { message: 'Choose a file' }) }),
  async ({ taskId, file }, ctx) => {
    const viewer = await getViewer(ctx)
    const task = await requireTask(ctx, viewer, taskId, 'edit')
    const stored = await saveUpload(ctx, file, { kind: 'task_attachment', entity: 'Task', entityId: task._id, accept: ATTACHMENT_TYPES })
    if (!stored) return ok('Nothing to upload')
    await ctx.db(Task).updateOne(
      { _id: task._id },
      { $push: { attachments: { kind: 'file', fileId: stored._id, title: stored.name, size: stored.size, mime: stored.mime, uploadedById: ctx.memberId } } },
    )
    await logActivity(ctx, [{ type: 'attachment_added', taskId: task._id, projectId: task.projectId, meta: { name: stored.name } }])
    revalidateWork()
    return ok(`Attached ${stored.name}`)
  },
  WORK,
)

/** Add a link attachment (a URL with a title). */
export const addLinkAttachment = action(
  z.object({
    taskId: objectId,
    title: z.string({ error: 'Title is required' }).trim().min(1, 'Title is required').max(200),
    url: z.string().trim().url('Enter a valid URL, starting with https://').refine((u) => /^https?:\/\//i.test(u), 'Use an http or https link'),
  }),
  async ({ taskId, title, url }, ctx) => {
    const viewer = await getViewer(ctx)
    const task = await requireTask(ctx, viewer, taskId, 'edit')
    await ctx.db(Task).updateOne({ _id: task._id }, { $push: { attachments: { kind: 'link', url, title, uploadedById: ctx.memberId } } })
    await logActivity(ctx, [{ type: 'attachment_added', taskId: task._id, projectId: task.projectId, meta: { name: title } }])
    revalidateWork()
    return ok(`Link "${title}" added`)
  },
  WORK,
)

export const deleteAttachment = action(
  z.object({ taskId: objectId, attachmentId: objectId }),
  async ({ taskId, attachmentId }, ctx) => {
    const viewer = await getViewer(ctx)
    const task = await requireTask(ctx, viewer, taskId, 'edit')
    const item = (task.attachments ?? []).find((a) => String(a._id) === attachmentId)
    if (!item) throw new NotFoundError('That attachment')
    await ctx.db(Task).updateOne({ _id: task._id }, { $pull: { attachments: { _id: item._id } } })
    if (item.fileId) await deleteStoredFile(ctx.orgId, String(item.fileId))
    await logActivity(ctx, [{ type: 'attachment_deleted', taskId: task._id, projectId: task.projectId, meta: { name: item.title } }])
    revalidateWork()
    return ok(`Removed ${item.title}`)
  },
  WORK,
)
