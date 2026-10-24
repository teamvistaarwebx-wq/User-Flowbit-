'use server'

import { z } from 'zod'
import { action, ok } from '@/lib/actions'
import type { Ctx } from '@/lib/ctx'
import { ForbiddenError, NotFoundError } from '@/lib/errors'
import { deleteStoredFile, saveUpload } from '@/lib/files'
import { objectId } from '@/lib/validation'
import { Project } from '@/models/work/Project'
import { logActivity } from '@/modules/work/tasks/activity-log'
import { ATTACHMENT_TYPES } from '@/modules/work/tasks/constants'
import { revalidateWork } from '@/modules/work/tasks/revalidate'
import { canAccessProject } from './access'
import { findProject } from './queries'

const WORK = { product: 'work', perm: 'tasks.write' } as const

async function projectForFiles(ctx: Ctx, id: string) {
  const project = await findProject(ctx, id)
  if (!project || !canAccessProject(String(ctx.memberId), ctx.can('projects.write'), project)) throw new NotFoundError('That project')
  return project
}

/** Any project person can upload files (MAX_UPLOAD_MB each). */
export const uploadProjectFile = action(
  z.object({ projectId: objectId, file: z.instanceof(File, { message: 'Choose a file' }) }),
  async ({ projectId, file }, ctx) => {
    const project = await projectForFiles(ctx, projectId)
    const stored = await saveUpload(ctx, file, { kind: 'project_file', entity: 'Project', entityId: project._id, accept: ATTACHMENT_TYPES })
    if (!stored) return ok('Nothing to upload')
    await ctx.db(Project).updateOne(
      { _id: project._id },
      { $push: { files: { fileId: stored._id, name: stored.name, size: stored.size, mime: stored.mime, uploadedById: ctx.memberId } } },
    )
    await logActivity(ctx, [{ type: 'file_added', projectId: project._id, meta: { name: stored.name } }])
    revalidateWork()
    return ok(`Uploaded ${stored.name}`)
  },
  WORK,
)

/** The uploader, or anyone with projects.write, can delete a file. */
export const deleteProjectFile = action(
  z.object({ projectId: objectId, fileId: objectId }),
  async ({ projectId, fileId }, ctx) => {
    const project = await projectForFiles(ctx, projectId)
    const file = (project.files ?? []).find((f) => String(f._id) === fileId)
    if (!file) throw new NotFoundError('That file')
    if (String(file.uploadedById) !== String(ctx.memberId) && !ctx.can('projects.write')) throw new ForbiddenError('Only the person who uploaded a file can delete it.')
    await ctx.db(Project).updateOne({ _id: project._id }, { $pull: { files: { _id: file._id } } })
    await deleteStoredFile(ctx.orgId, String(file.fileId))
    await logActivity(ctx, [{ type: 'file_deleted', projectId: project._id, meta: { name: file.name } }])
    revalidateWork()
    return ok(`Deleted ${file.name}`)
  },
  WORK,
)
