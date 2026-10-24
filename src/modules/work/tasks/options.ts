import 'server-only'
import type { Ctx } from '@/lib/ctx'
import { todayIST } from '@/lib/dates'
import { oid } from '@/lib/serialize'
import { Client } from '@/models/Client'
import { Folder } from '@/models/work/Folder'
import { Project } from '@/models/work/Project'
import { SavedView } from '@/models/work/SavedView'
import { Space } from '@/models/work/Space'
import { projectAccessMatch } from '@/modules/work/projects/access'
import type { ClientOption, ProjectOption, SavedViewOption, SpaceOption, TaskData } from '@/components/work/tasks/types'
import type { Viewer } from './access'
import { getPeople } from './people'
import { fileUrl } from '@/lib/files'

const CLIENT_LIMIT = 300

/** Active projects the viewer can put tasks in. */
export async function projectOptions(ctx: Ctx, viewer: Viewer): Promise<ProjectOption[]> {
  const rows = await ctx.db(Project)
    .find({ archivedAt: null, status: { $ne: 'cancelled' }, ...projectAccessMatch(viewer.memberId, ctx.can('projects.write'), oid) }, { name: 1, code: 1, color: 1, clientId: 1 })
    .sort({ name: 1 })
    .lean()
  return rows.map((p) => ({ id: String(p._id), name: p.name, code: p.code, color: p.color ?? '#818CF8', clientId: p.clientId ? String(p.clientId) : undefined }))
}

/** Spaces the viewer has full access to, with their active lists. */
export async function spaceOptions(ctx: Ctx, viewer: Viewer): Promise<SpaceOption[]> {
  const ids = viewer.spaceIds.map(oid)
  if (!ids.length) return []
  const [spaces, folders] = await Promise.all([
    ctx.db(Space).find({ _id: { $in: ids }, archivedAt: null }, { name: 1, color: 1 }).sort({ order: 1, createdAt: -1 }).lean(),
    ctx.db(Folder).find({ spaceId: { $in: ids }, archivedAt: null }, { name: 1, color: 1, spaceId: 1 }).sort({ order: 1 }).lean(),
  ])
  return spaces.map((s) => ({
    id: String(s._id),
    name: s.name,
    color: s.color ?? '#818CF8',
    folders: folders.filter((f) => String(f.spaceId) === String(s._id)).map((f) => ({ id: String(f._id), name: f.name, color: f.color ?? '#7E768C' })),
  }))
}

export async function clientOptions(ctx: Ctx): Promise<ClientOption[]> {
  if (!ctx.can('clients.read')) return []
  const rows = await ctx.db(Client).find({ status: { $ne: 'inactive' } }, { name: 1, logoFileId: 1 }).sort({ name: 1 }).limit(CLIENT_LIMIT).lean()
  return rows.map((c) => ({ id: String(c._id), name: c.name, ...(c.logoFileId ? { logoUrl: fileUrl(c.logoFileId) } : {}) }))
}

/** My saved views plus views others shared. */
export async function savedViewOptions(ctx: Ctx): Promise<SavedViewOption[]> {
  const rows = await ctx.db(SavedView).find({ $or: [{ ownerId: ctx.memberId }, { shared: true }] }).sort({ order: 1, createdAt: 1 }).lean()
  return rows.map((v) => ({ id: String(v._id), name: v.name, query: v.query ?? '', shared: Boolean(v.shared), mine: String(v.ownerId) === String(ctx.memberId) }))
}

/** People, pickers and permissions for the Tasks screens. */
export async function taskData(ctx: Ctx, viewer: Viewer): Promise<TaskData> {
  const [people, projects, spaces, clients] = await Promise.all([getPeople(ctx), projectOptions(ctx, viewer), spaceOptions(ctx, viewer), clientOptions(ctx)])
  return {
    me: viewer.memberId,
    today: todayIST(),
    people,
    projects,
    spaces,
    clients,
    canWrite: ctx.can('tasks.write'),
    canManage: ctx.can('tasks.manage'),
    personalMode: ctx.org.mode === 'personal',
  }
}
