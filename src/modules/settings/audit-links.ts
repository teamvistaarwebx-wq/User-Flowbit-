import 'server-only'
import { isValidObjectId, Types } from 'mongoose'
import { canOpenPage } from '@/lib/catalog'
import type { Ctx } from '@/lib/ctx'
import { Employee } from '@/models/muster/Employee'
import { Deal } from '@/models/orbit/Deal'
import { Lead } from '@/models/orbit/Lead'
import { Project } from '@/models/work/Project'
import { Task } from '@/models/work/Task'
import { visibleEmployeeIds, visibleFilter } from '@/modules/muster/people/scope'
import { dealAccess, leadAccess } from '@/modules/orbit/scope'
import { projectAccessMatch } from '@/modules/work/projects/access'
import { taskVisibilityFilter } from '@/modules/work/tasks/viewer'
import { entityHref } from './audit-meta'

type Row = { entity: string; entityId?: string | null }

/** Entities whose pages hide individual records; the filter returns the ids this viewer may open. */
const RECORD_SCOPES: Record<string, (ctx: Ctx, ids: Types.ObjectId[]) => Promise<unknown[]>> = {
  Project: (ctx, ids) => ctx.db(Project).distinct('_id', { _id: { $in: ids }, ...projectAccessMatch(String(ctx.memberId), ctx.can('projects.write'), (id) => new Types.ObjectId(id)) }),
  Task: async (ctx, ids) => ctx.db(Task).distinct('_id', { $and: [{ _id: { $in: ids } }, await taskVisibilityFilter(ctx)] }),
  Lead: (ctx, ids) => ctx.db(Lead).distinct('_id', { _id: { $in: ids }, ...leadAccess(ctx) }),
  Deal: (ctx, ids) => ctx.db(Deal).distinct('_id', { _id: { $in: ids }, ...dealAccess(ctx) }),
  Employee: async (ctx, ids) => ctx.db(Employee).distinct('_id', { _id: { $in: ids }, ...visibleFilter(await visibleEmployeeIds(ctx)) }),
}

/**
 * Links for audit rows, only where this viewer can actually open the target: the page's
 * product/feature/permission gate (catalog) and, for record-scoped pages, the record itself.
 * The audit log lists everything for `audit.read`; a link that lands on 404 or /app/denied helps nobody.
 */
export async function auditLinks(ctx: Ctx, rows: Row[]): Promise<Map<string, string>> {
  const links = new Map<string, string>()
  const pending = new Map<string, Types.ObjectId[]>()
  for (const row of rows) {
    const href = entityHref(row.entity, row.entityId)
    if (!href || !canOpenPage(href, ctx)) continue
    const key = `${row.entity}:${row.entityId}`
    if (!RECORD_SCOPES[row.entity]) {
      links.set(key, href)
      continue
    }
    if (!isValidObjectId(row.entityId)) continue
    pending.set(row.entity, [...(pending.get(row.entity) ?? []), new Types.ObjectId(String(row.entityId))])
  }
  await Promise.all(
    [...pending].map(async ([entity, ids]) => {
      const open = new Set((await RECORD_SCOPES[entity](ctx, ids)).map(String))
      for (const id of open) links.set(`${entity}:${id}`, entityHref(entity, id) ?? '')
    }),
  )
  return links
}
