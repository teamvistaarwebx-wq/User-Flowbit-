'use server'

import { z } from 'zod'
import { action, fail, ok } from '@/lib/actions'
import { UserError } from '@/lib/errors'
import { isoDate, objectId } from '@/lib/validation'
import { canModifyTask } from './access'
import { STATUS_LABEL } from './constants'
import { findTask } from './load'
import { applyTaskPatch, type TaskPatch } from './mutate'
import { openBlockersWarning } from './relations'
import { removeTask } from './remove'
import { revalidateWork } from './revalidate'
import { priorityField, statusField } from './schemas'
import { getViewer } from './viewer'

const MAX_BULK = 200

const bulkSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('status'), ids: z.array(objectId).min(1).max(MAX_BULK), status: statusField, blockedReason: z.string().max(1000).optional() }),
  z.object({ op: z.literal('priority'), ids: z.array(objectId).min(1).max(MAX_BULK), priority: priorityField }),
  z.object({ op: z.literal('assign'), ids: z.array(objectId).min(1).max(MAX_BULK), assigneeIds: z.array(objectId).min(1, 'Pick at least one person') }),
  z.object({ op: z.literal('due'), ids: z.array(objectId).min(1).max(MAX_BULK), dueDate: isoDate.nullable() }),
  z.object({ op: z.literal('project'), ids: z.array(objectId).min(1).max(MAX_BULK), projectId: objectId.nullable() }),
  z.object({ op: z.literal('delete'), ids: z.array(objectId).min(1).max(MAX_BULK) }),
])

type BulkInput = z.output<typeof bulkSchema>

function patchFor(input: BulkInput): TaskPatch {
  switch (input.op) {
    case 'status': return { status: input.status, blockedReason: input.blockedReason }
    case 'priority': return { priority: input.priority }
    case 'assign': return { assigneeIds: input.assigneeIds }
    case 'due': return { dueDate: input.dueDate }
    case 'project': return { projectId: input.projectId }
    default: return {}
  }
}

const VERB: Record<BulkInput['op'], string> = { status: 'Updated', priority: 'Updated', assign: 'Reassigned', due: 'Rescheduled', project: 'Moved', delete: 'Deleted' }

/**
 * Bulk bar on the list view. Each task gets the same permission check and its
 * own activity rows; tasks the member can't edit are skipped and counted.
 */
export const bulkUpdateTasks = action(
  bulkSchema,
  async (input, ctx) => {
    const viewer = await getViewer(ctx)
    const patch = patchFor(input)
    let done = 0
    let skipped = 0
    let stillBlocked = 0
    const problems: string[] = []
    for (const id of [...new Set(input.ids)]) {
      const task = await findTask(ctx, id)
      if (!task || !canModifyTask(viewer, task)) {
        skipped++
        continue
      }
      try {
        if (input.op === 'delete') await removeTask(ctx, task)
        else await applyTaskPatch(ctx, viewer, task, patch)
        if (input.op === 'status' && input.status === 'done' && task.status !== 'done' && (await openBlockersWarning(ctx, task))) stillBlocked++
        done++
      } catch (error) {
        if (!(error instanceof UserError)) throw error
        skipped++
        problems.push(error.message)
      }
    }
    revalidateWork()
    if (!done) return fail(problems[0] ?? "You can't edit any of the selected tasks.")
    const what = input.op === 'status' ? ` to ${STATUS_LABEL[input.status]}` : ''
    const extra = skipped ? `; ${skipped} skipped (${problems[0] ?? 'no access'})` : ''
    const blockers = stillBlocked ? `. Heads up: ${stillBlocked} of them still ${stillBlocked === 1 ? 'has' : 'have'} open blockers` : ''
    return ok(`${VERB[input.op]} ${done} task${done === 1 ? '' : 's'}${what}${extra}${blockers}`)
  },
  { product: 'work', perm: 'tasks.write' },
)
