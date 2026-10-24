'use server'

import { z } from 'zod'
import { action, ok } from '@/lib/actions'
import { objectId } from '@/lib/validation'
import { requireTask } from './load'
import { RELATION_KINDS, RELATION_LABEL } from './relation-flags'
import { addRelation, removeRelation, searchLinkable, type RelatedTask } from './relations'
import { revalidateWork } from './revalidate'
import { getViewer } from './viewer'

const relationInput = z.object({ id: objectId, otherId: objectId, kind: z.enum(RELATION_KINDS) })

/** Task panel → Relations: link this task to another (Blocked by, Blocks, Related). */
export const addTaskRelation = action(
  relationInput,
  async ({ id, otherId, kind }, ctx) => {
    const viewer = await getViewer(ctx)
    const other = await addRelation(ctx, viewer, id, otherId, kind)
    revalidateWork()
    return ok(`${RELATION_LABEL[kind]} ${other.key} added`)
  },
  { product: 'work', perm: 'tasks.write' },
)

export const removeTaskRelation = action(
  relationInput,
  async ({ id, otherId, kind }, ctx) => {
    const viewer = await getViewer(ctx)
    await removeRelation(ctx, viewer, id, otherId, kind)
    revalidateWork()
    return ok('Link removed')
  },
  { product: 'work', perm: 'tasks.write' },
)

/** Tasks to link to, by key ("VW-42") or words of the title. */
export const searchTasksToLink = action(
  z.object({ id: objectId, q: z.string().max(100) }),
  async ({ id, q }, ctx) => {
    const viewer = await getViewer(ctx)
    const task = await requireTask(ctx, viewer, id)
    return ok<RelatedTask[]>(undefined, await searchLinkable(ctx, viewer, task, q))
  },
  { product: 'work', perm: 'tasks.read', allowReadOnly: true },
)
