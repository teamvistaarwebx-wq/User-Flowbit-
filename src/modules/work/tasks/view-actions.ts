'use server'

import { z } from 'zod'
import { action, ok } from '@/lib/actions'
import type { Ctx } from '@/lib/ctx'
import { ForbiddenError, NotFoundError } from '@/lib/errors'
import { checkbox, objectId } from '@/lib/validation'
import { SavedView } from '@/models/work/SavedView'
import { parseTaskQuery, taskQueryString } from './filters'
import { revalidateWork } from './revalidate'

const WORK = { product: 'work', perm: 'tasks.read' } as const
const viewName = z.string({ error: 'Name the view' }).trim().min(1, 'Name the view').max(60, 'Use at most 60 characters')

/** Normalises a raw query string through the Tasks URL parser (drops anything unknown). */
const cleanQuery = (raw: string) => {
  const q = parseTaskQuery(Object.fromEntries(new URLSearchParams(raw.replace(/^\?/, ''))))
  return { query: taskQueryString(q, { page: 1, saved: null }), view: q.view }
}

/** Save the current Tasks filters as a named view (personal or shared with everyone). */
export const saveView = action(
  z.object({ name: viewName, query: z.string().max(2000), shared: checkbox }),
  async ({ name, query, shared }, ctx) => {
    const clean = cleanQuery(query)
    const count = await ctx.db(SavedView).countDocuments({ ownerId: ctx.memberId })
    const view = await ctx.db(SavedView).create({ name, ...clean, shared, ownerId: ctx.memberId, order: count })
    revalidateWork()
    return ok(`View "${name}" saved`, { id: String(view._id) }, `/app/work/tasks?${clean.query}&saved=${view._id}`)
  },
  WORK,
)

async function editableView(ctx: Ctx, id: string) {
  const view = await ctx.db(SavedView).findById(id).lean()
  if (!view) throw new NotFoundError('That view')
  const mine = String(view.ownerId) === String(ctx.memberId)
  if (!mine && !(view.shared && ctx.can('tasks.manage'))) throw new ForbiddenError('Only the owner can change this view.')
  return view
}

/** Rename, share/unshare or overwrite the filters of a view. */
export const updateView = action(
  z.object({ id: objectId, name: viewName, shared: checkbox, query: z.string().max(2000).optional() }),
  async ({ id, name, shared, query }, ctx) => {
    const view = await editableView(ctx, id)
    await ctx.db(SavedView).updateOne({ _id: view._id }, { $set: { name, shared, ...(query !== undefined ? cleanQuery(query) : {}) } })
    revalidateWork()
    return ok(`View "${name}" updated`)
  },
  WORK,
)

export const deleteView = action(
  z.object({ id: objectId }),
  async ({ id }, ctx) => {
    const view = await editableView(ctx, id)
    await ctx.db(SavedView).deleteOne({ _id: view._id })
    revalidateWork()
    return ok(`View "${view.name}" deleted`, undefined, '/app/work/tasks')
  },
  WORK,
)
