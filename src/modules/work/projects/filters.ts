import { first, type SearchParams } from '@/lib/list'
import { escapeRegex } from '@/lib/utils'
import { PROJECT_HEALTH, PROJECT_STATUSES, type ProjectHealth, type ProjectStatus } from './constants'

/** Projects list URL state (?view=table&status=active&health=at_risk&q=...) and its Mongo filter (pure). */

export const PROJECT_SORTS = ['updatedAt', 'createdAt', 'name', 'health', 'progress'] as const
export type ProjectSort = (typeof PROJECT_SORTS)[number]
export const PROJECT_SORT_LABEL: Record<ProjectSort, string> = { updatedAt: 'Date updated', createdAt: 'Date created', name: 'Name', health: 'Health', progress: 'Progress' }

export type ProjectQuery = {
  view: 'cards' | 'table'
  q: string
  status: ProjectStatus | null
  health: ProjectHealth | null
  client: string | null
  archived: boolean
  mine: boolean
  sort: ProjectSort
  dir: 'asc' | 'desc'
  page: number
}

export function parseProjectQuery(sp: SearchParams): ProjectQuery {
  const status = first(sp.status)
  const health = first(sp.health)
  const sort = first(sp.sort)
  const client = first(sp.client)
  return {
    view: first(sp.view) === 'table' ? 'table' : 'cards',
    q: (first(sp.q) ?? '').trim().slice(0, 100),
    status: (PROJECT_STATUSES as readonly string[]).includes(status ?? '') ? (status as ProjectStatus) : null,
    health: (PROJECT_HEALTH as readonly string[]).includes(health ?? '') ? (health as ProjectHealth) : null,
    client: client && /^[a-f0-9]{24}$/i.test(client) ? client : null,
    archived: first(sp.archived) === '1',
    mine: first(sp.mine) === '1',
    sort: (PROJECT_SORTS as readonly string[]).includes(sort ?? '') ? (sort as ProjectSort) : 'updatedAt',
    dir: first(sp.dir) === 'asc' ? 'asc' : 'desc',
    page: Math.max(1, Number.parseInt(first(sp.page) ?? '1', 10) || 1),
  }
}

/** Filters beyond access: archive state, status, health, client, mine and search (name only for ≤2 characters). */
export function projectListMatch(q: ProjectQuery, memberId: string, toId: (id: string) => unknown = (id) => id): Record<string, unknown> {
  const and: Record<string, unknown>[] = [{ archivedAt: q.archived ? { $ne: null } : null }]
  if (q.status) and.push({ status: q.status })
  if (q.health) and.push({ health: q.health })
  if (q.client) and.push({ clientId: toId(q.client) })
  if (q.mine) and.push({ $or: [{ leadId: toId(memberId) }, { memberIds: toId(memberId) }] })
  if (q.q) {
    const re = { $regex: escapeRegex(q.q), $options: 'i' }
    and.push(q.q.length <= 2 ? { name: re } : { $or: [{ name: re }, { code: re }] })
  }
  return { $and: and }
}

export function projectSort(q: ProjectQuery): Record<string, 1 | -1> {
  const dir = q.dir === 'asc' ? 1 : -1
  const field = q.sort === 'health' ? 'healthScore' : q.sort
  return { [field]: dir, _id: -1 }
}
