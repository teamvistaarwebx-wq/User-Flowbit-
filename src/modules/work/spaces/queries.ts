import 'server-only'
import { isValidObjectId, type Types } from 'mongoose'
import type { Ctx } from '@/lib/ctx'
import { fileUrl } from '@/lib/files'
import { oid } from '@/lib/serialize'
import { escapeRegex } from '@/lib/utils'
import { Folder } from '@/models/work/Folder'
import { Space } from '@/models/work/Space'
import { Task } from '@/models/work/Task'
import { visibleTasksMatch, type Viewer } from '@/modules/work/tasks/access'
import { canManageSpace, hasFullSpaceAccess } from './access'

type Id = Types.ObjectId

export type SpaceCard = {
  id: string
  name: string
  description: string | null
  color: string
  icon: string
  folderCount: number
  open: number
  total: number
  memberIds: string[]
  shared: boolean
  access: 'full' | 'scoped'
  canManage: boolean
  archived: boolean
}

/** Spaces where the viewer can see at least one task without full access. */
async function scopedSpaceIds(ctx: Ctx, viewer: Viewer): Promise<string[]> {
  const ids = await ctx.db(Task).distinct('spaceId', { ...visibleTasksMatch(viewer, oid), spaceId: { $ne: null } })
  return (ids as Id[]).map(String).filter((id) => !viewer.spaceIds.includes(id))
}

async function taskCountsBy(ctx: Ctx, field: 'spaceId' | 'folderId', ids: Id[], extra: Record<string, unknown> = {}) {
  if (!ids.length) return new Map<string, { open: number; total: number }>()
  const rows = await ctx.db(Task).aggregate<{ _id: Id; open: number; total: number }>([
    { $match: { [field]: { $in: ids }, parentId: null, isPersonal: { $ne: true }, ...extra } },
    { $group: { _id: `$${field}`, total: { $sum: 1 }, open: { $sum: { $cond: [{ $ne: ['$status', 'done'] }, 1, 0] } } } },
  ])
  return new Map(rows.map((r) => [String(r._id), { open: r.open, total: r.total }]))
}

/** Space cards: full-access spaces plus "scoped" ones where I only see my own tasks. */
export async function listSpaces(ctx: Ctx, viewer: Viewer, opts: { archived: boolean; q: string }): Promise<SpaceCard[]> {
  const scoped = opts.archived ? [] : await scopedSpaceIds(ctx, viewer)
  const ids = [...viewer.spaceIds, ...scoped].map(oid)
  const filter: Record<string, unknown> = { _id: { $in: ids }, archivedAt: opts.archived ? { $ne: null } : null }
  if (opts.q) filter.name = { $regex: escapeRegex(opts.q), $options: 'i' }
  const spaces = await ctx.db(Space).find(filter).sort({ order: 1, createdAt: -1 }).lean()
  const spaceIds = spaces.map((s) => s._id)
  const [counts, folders] = await Promise.all([
    taskCountsBy(ctx, 'spaceId', spaceIds),
    ctx.db(Folder).aggregate<{ _id: Id; n: number }>([{ $match: { spaceId: { $in: spaceIds }, archivedAt: null } }, { $group: { _id: '$spaceId', n: { $sum: 1 } } }]),
  ])
  const me = viewer.memberId
  const manageAll = ctx.can('spaces.manage')
  return spaces.map((s) => ({
    id: String(s._id),
    name: s.name,
    description: s.description ?? null,
    color: s.color ?? '#818CF8',
    icon: s.icon ?? 'folder',
    folderCount: folders.find((f) => String(f._id) === String(s._id))?.n ?? 0,
    open: counts.get(String(s._id))?.open ?? 0,
    total: counts.get(String(s._id))?.total ?? 0,
    memberIds: [...new Set([String(s.createdById), ...(s.members ?? []).map((m) => String(m.memberId))])],
    shared: String(s.createdById) !== me && (s.members ?? []).some((m) => String(m.memberId) === me),
    access: hasFullSpaceAccess(me, manageAll, s) ? 'full' : 'scoped',
    canManage: canManageSpace(me, manageAll, s),
    archived: Boolean(s.archivedAt),
  }))
}

export async function findSpace(ctx: Ctx, id: string) {
  return isValidObjectId(id) ? ctx.db(Space).findById(id).lean() : null
}

export type SpaceDoc = NonNullable<Awaited<ReturnType<typeof findSpace>>>

export type FolderRow = { id: string; name: string; description: string | null; color: string; open: number; total: number; done: number; archived: boolean }

/** Lists of a space with counts; scoped viewers only get lists holding tasks they can see. */
export async function spaceFolders(ctx: Ctx, viewer: Viewer, space: SpaceDoc, opts: { full: boolean; archived: boolean }): Promise<FolderRow[]> {
  const folders = await ctx.db(Folder).find({ spaceId: space._id, archivedAt: opts.archived ? { $ne: null } : null }).sort({ order: 1, createdAt: 1 }).lean()
  const visible = opts.full ? {} : visibleTasksMatch(viewer, oid)
  const counts = await taskCountsBy(ctx, 'folderId', folders.map((f) => f._id), visible)
  return folders
    .map((f) => {
      const c = counts.get(String(f._id)) ?? { open: 0, total: 0 }
      return { id: String(f._id), name: f.name, description: f.description ?? null, color: f.color ?? '#7E768C', open: c.open, total: c.total, done: c.total - c.open, archived: Boolean(f.archivedAt) }
    })
    .filter((f) => opts.full || f.total > 0)
}

/** Overview: recent tasks, status breakdown and resources (attachments) of the space or one list. */
export async function spaceOverview(ctx: Ctx, viewer: Viewer, space: SpaceDoc, opts: { full: boolean; folderId?: string | null }) {
  const scope: Record<string, unknown> = { spaceId: space._id, isPersonal: { $ne: true }, ...(opts.folderId ? { folderId: oid(opts.folderId) } : {}) }
  const match = opts.full ? scope : { $and: [scope, visibleTasksMatch(viewer, oid)] }
  const [recent, byStatus, withFiles] = await Promise.all([
    ctx.db(Task).find(match, { key: 1, title: 1, status: 1, folderId: 1, updatedAt: 1 }).sort({ updatedAt: -1 }).limit(10).lean(),
    ctx.db(Task).aggregate<{ _id: string; n: number }>([{ $match: { ...match, parentId: null } }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
    ctx.db(Task).find({ ...match, 'attachments._id': { $exists: true } }, { key: 1, title: 1, attachments: 1 }).sort({ updatedAt: -1 }).limit(30).lean(),
  ])
  const resources = withFiles
    .flatMap((t) => (t.attachments ?? []).map((a) => ({ id: String(a._id), title: a.title, kind: a.kind, url: a.kind === 'link' ? a.url ?? '#' : fileUrl(a.fileId), size: a.size ?? null, uploadedAt: a.uploadedAt ? new Date(a.uploadedAt).toISOString() : '', taskId: String(t._id), taskKey: t.key })))
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))
    .slice(0, 30)
  return {
    recent: recent.map((t) => ({ id: String(t._id), key: t.key, title: t.title, status: t.status, folderId: t.folderId ? String(t.folderId) : null, updatedAt: new Date(t.updatedAt).toISOString() })),
    byStatus: Object.fromEntries(byStatus.map((s) => [s._id, s.n])) as Record<string, number>,
    resources,
  }
}
