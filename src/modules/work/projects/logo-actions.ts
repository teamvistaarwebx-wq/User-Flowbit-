'use server'

import { z } from 'zod'
import { action, ok } from '@/lib/actions'
import { audit } from '@/lib/audit'
import { deleteStoredFile } from '@/lib/files'
import { objectId } from '@/lib/validation'
import { Project } from '@/models/work/Project'
import { saveEntityLogo } from '@/modules/files/entity-logo'
import { revalidateWork } from '@/modules/work/tasks/revalidate'
import { requireEditableProject } from './guard'

const WORK = { product: 'work', perm: 'projects.read' } as const

/** Sets the project's logo (the lead or a project manager); the old file is deleted. */
export const uploadProjectLogo = action(
  z.object({ projectId: objectId, logo: z.instanceof(File, { error: 'Choose an image' }) }),
  async ({ projectId, logo }, ctx) => {
    const project = await requireEditableProject(ctx, projectId)
    const fileId = await saveEntityLogo(ctx, logo, { kind: 'project_logo', entity: 'Project', entityId: project._id })
    await ctx.db(Project).updateOne({ _id: project._id }, { $set: { logoFileId: fileId } })
    if (project.logoFileId) await deleteStoredFile(ctx.orgId, String(project.logoFileId))
    await audit(ctx, { action: 'project.logo_updated', entity: 'Project', entityId: project._id, product: 'work', summary: `Logo updated for project '${project.name}'` })
    revalidateWork()
    return ok('Logo updated.')
  },
  WORK,
)

export const removeProjectLogo = action(
  z.object({ projectId: objectId }),
  async ({ projectId }, ctx) => {
    const project = await requireEditableProject(ctx, projectId)
    if (!project.logoFileId) return ok('There is no logo to remove.')
    await ctx.db(Project).updateOne({ _id: project._id }, { $unset: { logoFileId: 1 } })
    await deleteStoredFile(ctx.orgId, String(project.logoFileId))
    await audit(ctx, { action: 'project.logo_removed', entity: 'Project', entityId: project._id, product: 'work', summary: `Logo removed from project '${project.name}'` })
    revalidateWork()
    return ok('Logo removed.')
  },
  WORK,
)
