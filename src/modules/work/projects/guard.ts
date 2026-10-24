import 'server-only'
import type { Types } from 'mongoose'
import type { Ctx } from '@/lib/ctx'
import { ForbiddenError, NotFoundError, UserError } from '@/lib/errors'
import { formatSeq, nextSeq } from '@/lib/sequence'
import { Project } from '@/models/work/Project'
import { activeMemberIds } from '@/modules/work/tasks/people'
import { canAccessProject, canEditProject } from './access'
import { findProject } from './queries'

const CODE_TRIES = 20

/** A project the member may edit (projects.write or its lead). */
export async function requireEditableProject(ctx: Ctx, id: string) {
  const project = await findProject(ctx, id)
  if (!project) throw new NotFoundError('That project')
  const me = String(ctx.memberId)
  if (!canAccessProject(me, ctx.can('projects.write'), project)) throw new NotFoundError('That project')
  if (!canEditProject(me, ctx.can('projects.write'), project)) throw new ForbiddenError('Only the project lead or a project manager can change this project.')
  return project
}

/** Next free auto code: PROJ-001, PROJ-002 … (skips codes people typed themselves). */
export async function allocateProjectCode(ctx: Ctx): Promise<string> {
  for (let i = 0; i < CODE_TRIES; i++) {
    const code = formatSeq(await nextSeq(ctx.orgId, 'project'), { prefix: 'PROJ-', pad: 3 })
    if (!(await ctx.db(Project).exists({ code }))) return code
  }
  throw new UserError('Could not pick a project code. Enter one yourself.', { code: 'Enter a code' })
}

export async function assertCodeFree(ctx: Ctx, code: string, exceptId?: Types.ObjectId): Promise<void> {
  const taken = await ctx.db(Project).exists({ code, ...(exceptId ? { _id: { $ne: exceptId } } : {}) })
  if (taken) throw new UserError(`Project code "${code}" is already in use`, { code: `Project code "${code}" is already in use` })
}

/** Lead and members must be active; the lead is always a member. */
export async function checkProjectPeople(ctx: Ctx, leadId: string, memberIds: string[]): Promise<string[]> {
  const all = [...new Set([leadId, ...memberIds])]
  const active = await activeMemberIds(ctx, all)
  if (!active.has(leadId)) throw new UserError('Pick an active member as the lead.', { leadId: 'Pick an active member' })
  if (active.size !== all.length) throw new UserError("One or more members aren't active in this workspace.", { memberIds: 'Pick active members only' })
  return all
}

export const isDuplicateKey = (error: unknown) => typeof error === 'object' && error !== null && (error as { code?: number }).code === 11000
