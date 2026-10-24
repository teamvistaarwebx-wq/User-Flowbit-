'use server'

import { z } from 'zod'
import { action, ok } from '@/lib/actions'
import { audit } from '@/lib/audit'
import { ForbiddenError, UserError } from '@/lib/errors'
import { deleteStoredFile } from '@/lib/files'
import { objectId } from '@/lib/validation'
import { FolioBillingPlan } from '@/models/folio/BillingPlan'
import { Milestone } from '@/models/work/Milestone'
import { Project } from '@/models/work/Project'
import { Task } from '@/models/work/Task'
import { TaskActivity } from '@/models/work/TaskActivity'
import { TimeEntry } from '@/models/work/TimeEntry'
import { logActivity, type ActivityInput } from '@/modules/work/tasks/activity-log'
import { notifyProjectLead } from '@/modules/work/tasks/notify'
import { revalidateWork } from '@/modules/work/tasks/revalidate'
import { resolveClient } from '@/modules/work/tasks/validate'
import { allocateProjectCode, assertCodeFree, checkProjectPeople, isDuplicateKey, requireEditableProject } from './guard'
import { projectSchema } from './schemas'
import { recomputeProjectHealth } from './stats'
import { projectStoredFileIds } from './stored-files'

const WORK = { product: 'work', perm: 'projects.read' } as const

/** New project: auto code when blank, lead notified, then the detail page. */
export const createProject = action(
  projectSchema,
  async (input, ctx) => {
    ctx.assert('projects.write', 'Only project managers can create projects.')
    const memberIds = await checkProjectPeople(ctx, input.leadId, input.memberIds)
    if (input.clientId) await resolveClient(ctx, input.clientId)
    if (input.code) await assertCodeFree(ctx, input.code)
    const doc = { ...input, memberIds, createdById: ctx.memberId }
    let project
    try {
      project = await ctx.db(Project).create({ ...doc, code: input.code ?? (await allocateProjectCode(ctx)) })
    } catch (error) {
      if (!isDuplicateKey(error)) throw error
      if (input.code) throw new UserError(`Project code "${input.code}" is already in use`, { code: `Project code "${input.code}" is already in use` })
      project = await ctx.db(Project).create({ ...doc, code: await allocateProjectCode(ctx) })
    }
    await logActivity(ctx, [{ type: 'project_created', projectId: project._id }])
    await audit(ctx, { action: 'project.created', entity: 'Project', entityId: project._id, summary: `Created project ${project.code} ${project.name}`, product: 'work' })
    await notifyProjectLead(ctx, project)
    revalidateWork()
    return ok(`Project '${project.name}' created`, { id: String(project._id) }, `/app/work/projects/${project._id}`)
  },
  WORK,
)

const FIELD_LABEL: Record<string, string> = { name: 'name', code: 'code', description: 'description', clientId: 'client', color: 'colour', startDate: 'start date', endDate: 'end date', tags: 'tags' }

/** Edit details, lead and members (projects.write or the lead). */
export const updateProject = action(
  projectSchema.and(z.object({ id: objectId })),
  async ({ id, ...input }, ctx) => {
    const project = await requireEditableProject(ctx, id)
    const memberIds = await checkProjectPeople(ctx, input.leadId, input.memberIds)
    if (input.clientId) await resolveClient(ctx, input.clientId)
    const code = input.code ?? project.code
    if (code !== project.code) await assertCodeFree(ctx, code, project._id)
    const next = { ...input, code, memberIds, clientId: input.clientId ?? null, description: input.description ?? null, startDate: input.startDate ?? null, endDate: input.endDate ?? null }
    await ctx.db(Project).updateOne({ _id: project._id }, { $set: next })
    // Tasks that took their client from the project follow it to the new client.
    const oldClient = project.clientId ? String(project.clientId) : null
    if (oldClient !== (next.clientId ?? null)) {
      const inherited = { projectId: project._id, ...(oldClient ? { clientId: project.clientId } : { clientId: null }) }
      await ctx.db(Task).updateMany(inherited, next.clientId ? { $set: { clientId: next.clientId } } : { $unset: { clientId: '' } })
    }

    const before = project as unknown as Record<string, unknown>
    const changed = Object.keys(FIELD_LABEL).filter((k) => JSON.stringify(before[k] ?? null) !== JSON.stringify((next as Record<string, unknown>)[k] ?? null))
    const rows: ActivityInput[] = []
    if (changed.length) rows.push({ type: 'project_updated', projectId: project._id, meta: { fields: changed.map((k) => FIELD_LABEL[k]) } })
    if (input.status !== project.status) rows.push({ type: 'project_status_changed', projectId: project._id, from: project.status, to: input.status })
    if (input.leadId !== String(project.leadId)) rows.push({ type: 'project_lead_changed', projectId: project._id, from: String(project.leadId), to: input.leadId })
    const oldMembers = (project.memberIds ?? []).map(String)
    const added = memberIds.filter((m) => !oldMembers.includes(m))
    const removed = oldMembers.filter((m) => !memberIds.includes(m))
    if (added.length) rows.push({ type: 'project_member_added', projectId: project._id, to: added })
    if (removed.length) rows.push({ type: 'project_member_removed', projectId: project._id, from: removed })
    await logActivity(ctx, rows)
    if (input.leadId !== String(project.leadId)) await notifyProjectLead(ctx, { _id: project._id, name: input.name, leadId: input.leadId })
    await recomputeProjectHealth(ctx, project._id)
    await audit(ctx, { action: 'project.updated', entity: 'Project', entityId: project._id, summary: `Updated project ${code} ${input.name}`, product: 'work', changes: { before: project, after: next } })
    revalidateWork()
    return ok(`Project '${input.name}' saved`)
  },
  WORK,
)

/** Add people to a project. */
export const addProjectMembers = action(
  z.object({ id: objectId, memberIds: z.array(objectId).min(1, 'Pick at least one person') }),
  async ({ id, memberIds }, ctx) => {
    const project = await requireEditableProject(ctx, id)
    const all = await checkProjectPeople(ctx, String(project.leadId), [...(project.memberIds ?? []).map(String), ...memberIds])
    const added = all.filter((m) => !(project.memberIds ?? []).some((x) => String(x) === m) && m !== String(project.leadId))
    await ctx.db(Project).updateOne({ _id: project._id }, { $set: { memberIds: all } })
    if (added.length) await logActivity(ctx, [{ type: 'project_member_added', projectId: project._id, to: added }])
    revalidateWork()
    return ok(added.length ? `Added ${added.length} ${added.length === 1 ? 'person' : 'people'} to '${project.name}'` : 'Everyone picked is already on the project')
  },
  WORK,
)

export const removeProjectMember = action(
  z.object({ id: objectId, memberId: objectId }),
  async ({ id, memberId }, ctx) => {
    const project = await requireEditableProject(ctx, id)
    if (String(project.leadId) === memberId) throw new UserError("The lead can't be removed. Make someone else the lead first.")
    await ctx.db(Project).updateOne({ _id: project._id }, { $pull: { memberIds: memberId } })
    await logActivity(ctx, [{ type: 'project_member_removed', projectId: project._id, from: [memberId] }])
    revalidateWork()
    return ok(`Removed from '${project.name}'`)
  },
  WORK,
)

/** Archive (refused while tasks are open) and restore. */
export const archiveProject = action(
  z.object({ id: objectId }),
  async ({ id }, ctx) => {
    const project = await requireEditableProject(ctx, id)
    const open = await ctx.db(Task).countDocuments({ projectId: project._id, status: { $ne: 'done' }, isPersonal: { $ne: true } })
    if (open) throw new UserError(`Can't archive: ${open} task${open === 1 ? ' is' : 's are'} still open. Close or move ${open === 1 ? 'it' : 'them'} first.`)
    await ctx.db(Project).updateOne({ _id: project._id }, { $set: { archivedAt: new Date() } })
    await logActivity(ctx, [{ type: 'project_archived', projectId: project._id }])
    await audit(ctx, { action: 'project.archived', entity: 'Project', entityId: project._id, summary: `Archived project ${project.code} ${project.name}`, product: 'work' })
    revalidateWork()
    return ok(`Project '${project.name}' archived`)
  },
  WORK,
)

export const restoreProject = action(
  z.object({ id: objectId }),
  async ({ id }, ctx) => {
    const project = await requireEditableProject(ctx, id)
    await ctx.db(Project).updateOne({ _id: project._id }, { $set: { archivedAt: null } })
    await logActivity(ctx, [{ type: 'project_restored', projectId: project._id }])
    await audit(ctx, { action: 'project.restored', entity: 'Project', entityId: project._id, summary: `Restored project ${project.code} ${project.name}`, product: 'work' })
    revalidateWork()
    return ok(`Project '${project.name}' restored`)
  },
  WORK,
)

/** Hard delete: owner/admin only, and only when no task references the project. */
export const deleteProject = action(
  z.object({ id: objectId }),
  async ({ id }, ctx) => {
    if (!ctx.can('org.manage')) throw new ForbiddenError('Only workspace owners and admins can delete projects. Archive it instead.')
    const project = await requireEditableProject(ctx, id)
    if (await ctx.db(Task).exists({ projectId: project._id })) throw new UserError("Can't delete a project that has tasks. Delete or move its tasks first.")
    // Logged hours and Folio billing point at the project: deleting would orphan them.
    if (await ctx.db(TimeEntry).exists({ projectId: project._id })) throw new UserError("Can't delete a project with logged time. Archive it instead.")
    if (await ctx.db(FolioBillingPlan).exists({ workProjectId: project._id })) throw new UserError("Can't delete a project linked to a Folio billing plan. Archive it instead.")
    await Promise.all([
      ctx.db(Project).deleteOne({ _id: project._id }),
      ctx.db(Milestone).deleteMany({ projectId: project._id }),
      ctx.db(TaskActivity).deleteMany({ projectId: project._id }),
      ...projectStoredFileIds(project).map((fileId) => deleteStoredFile(ctx.orgId, fileId)),
    ])
    await audit(ctx, { action: 'project.deleted', entity: 'Project', entityId: project._id, summary: `Deleted project ${project.code} ${project.name}`, product: 'work' })
    // No revalidate: the client navigates to the list (refreshing the deleted project's page would 404).
    return ok(`Project '${project.name}' deleted`, undefined, '/app/work/projects')
  },
  WORK,
)
